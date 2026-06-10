// YouTube download proxy — Innertube edition.
// Instead of relying on third-party cobalt/Invidious instances (which YouTube
// blocks constantly), this calls YouTube's own internal "Innertube" API — the
// same API the official Android/iOS apps use. The ANDROID and IOS clients
// receive direct, uncyphered stream URLs for combined audio+video formats.
// No third-party servers involved, so nothing to rot.
//
// Fallback chain: ANDROID client → IOS client → TV_EMBEDDED → cobalt seeds.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Innertube client configurations. Each mimics an official YouTube app.
const INNERTUBE_CLIENTS = [
  {
    name: "ANDROID",
    context: {
      client: {
        clientName: "ANDROID",
        clientVersion: "19.30.36",
        androidSdkVersion: 34,
        hl: "en",
        gl: "US",
        utcOffsetMinutes: 0,
      },
    },
    headers: {
      "User-Agent": "com.google.android.youtube/19.30.36 (Linux; U; Android 14) gzip",
      "X-Youtube-Client-Name": "3",
      "X-Youtube-Client-Version": "19.30.36",
    },
  },
  {
    name: "IOS",
    context: {
      client: {
        clientName: "IOS",
        clientVersion: "19.29.1",
        deviceMake: "Apple",
        deviceModel: "iPhone16,2",
        osName: "iPhone",
        osVersion: "17.5.1.21F90",
        hl: "en",
        gl: "US",
        utcOffsetMinutes: 0,
      },
    },
    headers: {
      "User-Agent": "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)",
      "X-Youtube-Client-Name": "5",
      "X-Youtube-Client-Version": "19.29.1",
    },
  },
  {
    name: "TV_EMBEDDED",
    context: {
      client: {
        clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
        clientVersion: "2.0",
        hl: "en",
        gl: "US",
      },
      thirdParty: { embedUrl: "https://www.youtube.com/" },
    },
    headers: {
      "User-Agent": "Mozilla/5.0 (PlayStation; PlayStation 4/12.00) AppleWebKit/605.1.15",
      "X-Youtube-Client-Name": "85",
      "X-Youtube-Client-Version": "2.0",
    },
  },
];

// Cobalt instances as a last-ditch fallback.
const COBALT_SEEDS = [
  "https://cobalt-api.kwiatekmiki.com",
  "https://api.cobalt.best",
  "https://co.eepy.today",
];

function extractId(url) {
  for (const p of [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
  ]) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function jsonErr(msg, status = 502) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Call YouTube's Innertube player endpoint with one client config.
// Returns { url, mimeType } of the best combined (audio+video) format, or null.
async function innertubePlayer(client, ytId) {
  try {
    const r = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...client.headers,
      },
      body: JSON.stringify({
        context: client.context,
        videoId: ytId,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const data = await r.json();

    if (data.playabilityStatus?.status !== "OK") return null;

    // "formats" = combined audio+video (itag 18 = 360p, 22 = 720p when present).
    const formats = data.streamingData?.formats || [];
    const playable = formats.filter((f) => f.url && f.mimeType?.includes("mp4"));
    if (!playable.length) return null;

    // Highest resolution first.
    playable.sort((a, b) => (b.height || 0) - (a.height || 0));
    return { url: playable[0].url, height: playable[0].height };
  } catch {
    return null;
  }
}

async function askCobalt(inst, url) {
  try {
    const r = await fetch(inst, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ url, videoQuality: "720", filenameStyle: "basic", youtubeHLS: false }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    if ((data.status === "tunnel" || data.status === "redirect") && data.url) return data.url;
    return null;
  } catch {
    return null;
  }
}

function streamBack(file, ytId) {
  const ct = file.headers.get("content-type") || "video/mp4";
  const len = file.headers.get("content-length");
  const headers = {
    ...CORS,
    "Content-Type": ct,
    "Content-Disposition": `attachment; filename="${ytId}.mp4"`,
    "Cache-Control": "no-store",
  };
  if (len) headers["Content-Length"] = len;
  return new Response(file.body, { headers });
}

// Fetch a googlevideo stream URL. These URLs are IP-bound to the requester,
// and since the Worker made the Innertube call, the Worker's IP is authorized.
async function fetchStream(url, ua) {
  try {
    const file = await fetch(url, {
      headers: { "User-Agent": ua || "Mozilla/5.0" },
      signal: AbortSignal.timeout(30000),
    });
    if (file.ok && file.body) return file;
    return null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST")
      return new Response("Method not allowed", { status: 405, headers: CORS });

    let url;
    try {
      ({ url } = await request.json());
    } catch {
      return jsonErr("Invalid request body", 400);
    }

    const ytId = extractId(url || "");
    if (!ytId) return jsonErr("Invalid YouTube URL", 400);

    // 1) Query all Innertube clients in parallel; collect every working format.
    const results = await Promise.all(
      INNERTUBE_CLIENTS.map(async (c) => {
        const fmt = await innertubePlayer(c, ytId);
        return fmt ? { ...fmt, ua: c.headers["User-Agent"] } : null;
      }),
    );
    const formats = results.filter(Boolean).sort((a, b) => (b.height || 0) - (a.height || 0));

    // 2) Try streaming each candidate. The stream fetch must use the SAME
    //    user-agent family as the client that requested it.
    for (const fmt of formats) {
      const file = await fetchStream(fmt.url, fmt.ua);
      if (file) return streamBack(file, ytId);
    }

    // 3) Last resort: cobalt instances in parallel.
    const cobaltUrls = (
      await Promise.all(COBALT_SEEDS.map((i) => askCobalt(i, url)))
    ).filter(Boolean);
    for (const cu of cobaltUrls) {
      const file = await fetchStream(cu);
      if (file) return streamBack(file, ytId);
    }

    return jsonErr("All download sources are unavailable right now.");
  },
};
