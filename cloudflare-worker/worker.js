// YouTube download proxy — parallel version.
// Races multiple cobalt + Invidious instances AT THE SAME TIME instead of
// trying them one-by-one, so the whole request succeeds or fails in ~15-20s
// instead of minutes. First instance to produce a working stream wins.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const COBALT_SEEDS = [
  "https://cobalt-api.kwiatekmiki.com",
  "https://cobalt-api.ayo.tf",
  "https://api.cobalt.best",
  "https://capi.3kh0.net",
  "https://co.eepy.today",
  "https://downloadapi.stuff.solutions",
];
const INVIDIOUS_SEEDS = [
  "https://inv.nadeko.net",
  "https://yewtu.be",
  "https://invidious.nerdvpn.de",
  "https://invidious.f5.si",
  "https://iv.melmac.space",
  "https://invidious.privacydev.net",
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

async function fetchJson(url, ms = 6000) {
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(ms),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Ask ONE cobalt instance for a stream URL. Resolves to a URL or throws.
async function askCobalt(inst, url) {
  const r = await fetch(inst, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ url, videoQuality: "720", filenameStyle: "basic", youtubeHLS: false }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`${inst} ${r.status}`);
  const data = await r.json();
  if ((data.status === "tunnel" || data.status === "redirect" || data.status === "stream") && data.url) {
    return data.url;
  }
  throw new Error(`${inst} no stream`);
}

// Ask ONE Invidious instance for a direct combined-stream URL.
async function askInvidious(inst, ytId) {
  const meta = await fetchJson(`${inst}/api/v1/videos/${ytId}?fields=formatStreams`, 7000);
  const streams = meta?.formatStreams;
  if (!Array.isArray(streams) || !streams.length) throw new Error(`${inst} no formatStreams`);
  const pref = ["720p60", "720p", "480p", "360p"];
  for (const q of pref) {
    const s = streams.find((x) => x.qualityLabel === q && x.url);
    if (s) return s.url;
  }
  const any = streams.find((x) => x.url);
  if (any) return any.url;
  throw new Error(`${inst} no url`);
}

// Race all sources in parallel; first resolved URL that actually streams wins.
async function findStreamUrl(url, ytId) {
  const attempts = [
    ...COBALT_SEEDS.map((i) => askCobalt(i, url)),
    ...INVIDIOUS_SEEDS.map((i) => askInvidious(i, ytId)),
  ];
  // Promise.any resolves with the first success, rejects only if ALL fail.
  // We collect successes as they come so we can try a second one if the
  // first stream URL turns out to be dead.
  const results = [];
  await Promise.allSettled(
    attempts.map(async (p) => {
      try {
        const u = await p;
        results.push(u);
      } catch {
        /* ignore */
      }
    }),
  );
  return results;
}

function streamBack(file, ytId) {
  const ct = file.headers.get("content-type") || "video/mp4";
  return new Response(file.body, {
    headers: {
      ...CORS,
      "Content-Type": ct,
      "Content-Disposition": `attachment; filename="${ytId}.mp4"`,
      "Cache-Control": "no-store",
    },
  });
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

    const candidates = await findStreamUrl(url, ytId);
    if (!candidates.length) {
      return jsonErr("All download sources are unavailable right now.");
    }

    // Try up to 3 candidate stream URLs — first one that streams wins.
    for (const candidate of candidates.slice(0, 3)) {
      try {
        const file = await fetch(candidate, {
          headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.youtube.com/" },
          signal: AbortSignal.timeout(30000),
        });
        if (file.ok && file.body) return streamBack(file, ytId);
      } catch {
        /* next candidate */
      }
    }

    return jsonErr("Found sources but none would stream. Try again in a minute.");
  },
};
