// YouTube download proxy.
// Strategy: get a direct stream URL from cobalt or Invidious, then stream it
// back with Content-Disposition: attachment so the browser saves the file.
// Returning a URL redirect doesn't work because YouTube CDN URLs are IP-scoped
// (the browser can't use a URL fetched on the server's behalf), so we must proxy.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Static seeds — supplemented by live directory lookups at request time.
const COBALT_SEEDS = [
  "https://cobalt-api.kwiatekmiki.com",
  "https://cobalt.drgns.space",
  "https://co.wuk.sh",
  "https://cobalt-api.ayo.tf",
  "https://api.cobalt.best",
  "https://cobalt.api.timelessnesses.me",
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
  "https://invidious.materialio.us",
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

async function fetchJson(url, ms = 7000) {
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

// Fetch live cobalt instance list.
async function liveCobaltInstances() {
  const data = await fetchJson("https://instances.cobalt.best/api/instances.json", 5000);
  if (!Array.isArray(data)) return [];
  return data
    .filter((i) => i.api_online && i.services?.youtube !== false)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map((i) => `${i.protocol || "https"}://${i.api}`)
    .slice(0, 10);
}

// Fetch live Invidious instance list.
async function liveInvidiousInstances() {
  const data = await fetchJson("https://api.invidious.io/instances.json?sort_by=health", 5000);
  if (!Array.isArray(data)) return [];
  return data
    .filter(([, m]) => m?.type === "https" && m?.api !== false)
    .map(([, m]) => m.uri.replace(/\/$/, ""))
    .slice(0, 8);
}

// Try cobalt instances. Returns a stream URL string on success, null on failure.
// Tries both the current API format and the older field names.
async function tryCobalt(instances, url) {
  const bodies = [
    // Current cobalt API (v7+)
    JSON.stringify({ url, vQuality: "720", filenameStyle: "basic", youtubeHLS: false }),
    // Older cobalt API
    JSON.stringify({ url, videoQuality: "720", filenameStyle: "basic" }),
  ];

  for (const inst of instances) {
    for (const body of bodies) {
      try {
        const r = await fetch(inst, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body,
          signal: AbortSignal.timeout(9000),
        });
        if (!r.ok) continue;
        const data = await r.json();
        if ((data.status === "tunnel" || data.status === "redirect" || data.status === "stream") && data.url) {
          return data.url;
        }
      } catch {
        /* try next */
      }
      break; // If first body got a response (even bad), don't retry same instance
    }
  }
  return null;
}

// Try Invidious instances using formatStreams URLs (direct YouTube CDN fetch from Worker).
// Cloudflare IPs can reach YouTube CDN; the URL is IP-scoped to the fetching IP so
// we must stream it through here rather than redirect.
async function tryInvidious(instances, ytId) {
  const QUALITY_PREF = ["720p60", "720p", "480p", "360p", "240p"];

  for (const inst of instances) {
    const meta = await fetchJson(
      `${inst}/api/v1/videos/${ytId}?fields=formatStreams`,
      8000,
    );
    const streams = meta?.formatStreams;
    if (!Array.isArray(streams) || !streams.length) continue;

    // Pick best quality that has a direct URL.
    let chosen = null;
    for (const q of QUALITY_PREF) {
      chosen = streams.find((s) => s.qualityLabel === q && s.url);
      if (chosen) break;
    }
    if (!chosen) chosen = streams.find((s) => s.url);
    if (!chosen?.url) continue;

    return chosen.url; // Direct YouTube CDN URL — Worker will proxy it
  }
  return null;
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

    // Discover live instances in parallel with using static seeds.
    const [liveCobalt, liveInv] = await Promise.all([
      liveCobaltInstances(),
      liveInvidiousInstances(),
    ]);
    const cobaltList = [...new Set([...liveCobalt, ...COBALT_SEEDS])];
    const invList = [...new Set([...liveInv, ...INVIDIOUS_SEEDS])];

    // Try cobalt first — it merges audio+video and returns a ready-to-play MP4.
    const cobaltUrl = await tryCobalt(cobaltList, url);
    if (cobaltUrl) {
      try {
        const file = await fetch(cobaltUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(60000),
        });
        if (file.ok && file.body) {
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
      } catch {
        /* fall through to Invidious */
      }
    }

    // Invidious fallback — gets a direct YouTube CDN stream URL, then proxies it.
    const invUrl = await tryInvidious(invList, ytId);
    if (invUrl) {
      try {
        const file = await fetch(invUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://www.youtube.com/",
          },
          signal: AbortSignal.timeout(60000),
        });
        if (file.ok && file.body) {
          return new Response(file.body, {
            headers: {
              ...CORS,
              "Content-Type": "video/mp4",
              "Content-Disposition": `attachment; filename="${ytId}.mp4"`,
              "Cache-Control": "no-store",
            },
          });
        }
      } catch {
        /* fall through */
      }
    }

    return jsonErr("All download sources are unavailable right now.");
  },
};
