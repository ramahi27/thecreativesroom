const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Community cobalt API instances (no key needed). Tried in order.
const COBALT_INSTANCES = [
  "https://cobalt-api.kwiatekmiki.com",
  "https://cobalt-backend.canine.tools",
  "https://capi.3kh0.net",
  "https://co.eepy.today",
  "https://cobalt-api.ayo.tf",
];

// Invidious fallback (combined 720p/360p) if every cobalt instance is down.
const INVIDIOUS = [
  "https://invidious.nerdvpn.de",
  "https://invidious.privacydev.net",
  "https://yewtu.be",
];

function extractId(url) {
  for (const p of [/[?&]v=([a-zA-Z0-9_-]{11})/, /youtu\.be\/([a-zA-Z0-9_-]{11})/, /embed\/([a-zA-Z0-9_-]{11})/, /shorts\/([a-zA-Z0-9_-]{11})/]) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
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

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

    let url;
    try { ({ url } = await request.json()); } catch {
      return new Response(JSON.stringify({ error: "Invalid body" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const ytId = extractId(url);
    if (!ytId) return new Response(JSON.stringify({ error: "Invalid YouTube URL" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

    // 1) Try cobalt community instances — these merge video+audio properly.
    for (const inst of COBALT_INSTANCES) {
      try {
        const r = await fetch(inst, {
          method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ url, videoQuality: "720", filenameStyle: "basic" }),
          signal: AbortSignal.timeout(12000),
        });
        if (!r.ok) continue;
        const data = await r.json();
        if ((data.status === "tunnel" || data.status === "redirect") && data.url) {
          const file = await fetch(data.url, { signal: AbortSignal.timeout(20000) });
          if (file.ok && file.body) return streamBack(file, ytId);
        }
      } catch { continue; }
    }

    // 2) Fallback: Invidious combined streams (720p then 360p).
    for (const inst of INVIDIOUS) {
      for (const itag of [22, 18]) {
        try {
          const file = await fetch(`${inst}/latest_version?id=${ytId}&itag=${itag}&local=true`, { signal: AbortSignal.timeout(12000) });
          if (file.ok && file.body) return streamBack(file, ytId);
        } catch { continue; }
      }
    }

    return new Response(JSON.stringify({ error: "All download sources are unavailable right now." }), { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
  },
};
