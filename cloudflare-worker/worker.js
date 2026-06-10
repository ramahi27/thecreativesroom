// YouTube download proxy — self-healing version.
// Instead of hardcoded instance lists (which rot), this fetches LIVE public
// directories of cobalt / Invidious / Piped instances at request time and
// tries every instance that's currently online. Streams the MP4 back with
// Content-Disposition: attachment.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Static seeds used alongside the live directories, in case directories are slow.
const COBALT_SEEDS = [
  "https://cobalt-api.kwiatekmiki.com",
  "https://cobalt-backend.canine.tools",
  "https://capi.3kh0.net",
  "https://co.eepy.today",
  "https://cobalt-api.ayo.tf",
  "https://api.cobalt.best",
  "https://cobalt.api.timelessnesses.me",
  "https://downloadapi.stuff.solutions",
  "https://cobalt-api.meowing.de",
  "https://blossom.imput.net",
];
const INVIDIOUS_SEEDS = [
  "https://invidious.nerdvpn.de",
  "https://inv.nadeko.net",
  "https://yewtu.be",
  "https://invidious.f5.si",
  "https://invidious.materialio.us",
  "https://iv.melmac.space",
];

function extractId(url) {
  for (const p of [/[?&]v=([a-zA-Z0-9_-]{11})/, /youtu\.be\/([a-zA-Z0-9_-]{11})/, /embed\/([a-zA-Z0-9_-]{11})/, /shorts\/([a-zA-Z0-9_-]{11})/]) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function jsonErr(msg, status = 502) {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function streamBack(upstream, name) {
  return new Response(upstream.body, {
    headers: {
      ...CORS,
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${name}.mp4"`,
      "Cache-Control": "no-store",
    },
  });
}

async function fetchJson(url, ms = 6000) {
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// Live directory of community cobalt instances.
async function liveCobaltInstances() {
  const data = await fetchJson("https://instances.cobalt.best/api/instances.json");
  if (!Array.isArray(data)) return [];
  return data
    .filter((i) => i.api_online && (i.services?.youtube !== false))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map((i) => `${i.protocol || "https"}://${i.api}`)
    .slice(0, 12);
}

// Live directory of Invidious instances.
async function liveInvidiousInstances() {
  const data = await fetchJson("https://api.invidious.io/instances.json?sort_by=health");
  if (!Array.isArray(data)) return [];
  return data
    .filter(([, meta]) => meta?.type === "https" && meta?.api !== false)
    .map(([, meta]) => meta.uri.replace(/\/$/, ""))
    .slice(0, 10);
}

async function tryCobalt(instances, url, ytId) {
  for (const inst of instances) {
    try {
      const r = await fetch(inst, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ url, videoQuality: "720", filenameStyle: "basic", youtubeHLS: false }),
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) continue;
      const data = await r.json();
      if ((data.status === "tunnel" || data.status === "redirect") && data.url) {
        const file = await fetch(data.url, { signal: AbortSignal.timeout(25000) });
        if (file.ok && file.body) return streamBack(file, ytId);
      }
    } catch { /* next */ }
  }
  return null;
}

async function tryInvidious(instances, ytId) {
  for (const inst of instances) {
    // Ask the API which combined streams exist, then proxy one.
    const meta = await fetchJson(`${inst}/api/v1/videos/${ytId}?fields=formatStreams`, 8000);
    const itags = (meta?.formatStreams || []).map((s) => s.itag).filter(Boolean);
    const candidates = itags.length ? itags : ["22", "18"];
    for (const itag of candidates) {
      try {
        const file = await fetch(`${inst}/latest_version?id=${ytId}&itag=${itag}&local=true`, {
          signal: AbortSignal.timeout(12000),
        });
        if (file.ok && file.body && (file.headers.get("content-type") || "").includes("video")) {
          return streamBack(file, ytId);
        }
      } catch { /* next */ }
    }
  }
  return null;
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

    let url;
    try { ({ url } = await request.json()); } catch { return jsonErr("Invalid body", 400); }
    const ytId = extractId(url || "");
    if (!ytId) return jsonErr("Invalid YouTube URL", 400);

    // Discover live instances (in parallel with using static seeds).
    const [liveCobalt, liveInv] = await Promise.all([liveCobaltInstances(), liveInvidiousInstances()]);
    const cobaltList = [...new Set([...liveCobalt, ...COBALT_SEEDS])];
    const invList = [...new Set([...liveInv, ...INVIDIOUS_SEEDS])];

    const viaCobalt = await tryCobalt(cobaltList, url, ytId);
    if (viaCobalt) return viaCobalt;

    const viaInv = await tryInvidious(invList, ytId);
    if (viaInv) return viaInv;

    return jsonErr("All download sources are unavailable right now.");
  },
};
