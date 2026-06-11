// YouTube download proxy — RapidAPI edition.
// All free download paths (cobalt, Invidious, Piped, direct Innertube) are now
// blocked by YouTube from datacenter IPs. This version uses a RapidAPI
// YouTube downloader service, which maintains its own unblocked infrastructure.
//
// Setup:
// 1. Sign up at https://rapidapi.com and subscribe to
//    "YT-API" (https://rapidapi.com/ytjar/api/yt-api) — free tier available,
//    paid from ~$10/mo for higher volume.
// 2. In the Cloudflare dashboard: Worker → Settings → Variables and Secrets →
//    Add → Type "Secret", name RAPIDAPI_KEY, paste your RapidAPI key.
// 3. Deploy this code.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const RAPIDAPI_HOST = "yt-api.p.rapidapi.com";

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

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST")
      return new Response("Method not allowed", { status: 405, headers: CORS });

    if (!env.RAPIDAPI_KEY) {
      return jsonErr("Server not configured: missing RAPIDAPI_KEY secret.", 500);
    }

    let url;
    try {
      ({ url } = await request.json());
    } catch {
      return jsonErr("Invalid request body", 400);
    }

    const ytId = extractId(url || "");
    if (!ytId) return jsonErr("Invalid YouTube URL", 400);

    // Ask YT-API for download links. cgeo=US helps consistency of results.
    let info;
    try {
      const r = await fetch(
        `https://${RAPIDAPI_HOST}/dl?id=${ytId}&cgeo=US`,
        {
          headers: {
            "x-rapidapi-key": env.RAPIDAPI_KEY,
            "x-rapidapi-host": RAPIDAPI_HOST,
          },
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!r.ok) {
        if (r.status === 429) return jsonErr("Download quota reached for this month.", 429);
        return jsonErr(`Downloader API error (${r.status}).`);
      }
      info = await r.json();
    } catch {
      return jsonErr("Downloader API timed out. Try again.");
    }

    if (info.status && info.status !== "OK") {
      return jsonErr(info.reason || "Video unavailable (private, deleted, or region-locked).");
    }

    // Combined audio+video streams (itag 22 = 720p, itag 18 = 360p).
    const combined = (info.formats || [])
      .filter((f) => f.url && (f.mimeType || "").includes("mp4"))
      .sort((a, b) => (b.height || 0) - (a.height || 0));

    // Adaptive video-only streams can go up to 1080p/4K.
    // We prefer these when their height beats the best combined stream,
    // since for visual reference work sharp picture matters more than audio.
    const adaptive = (info.adaptiveFormats || [])
      .filter((f) => f.url && (f.mimeType || "").includes("video/mp4") && !f.audioQuality)
      .sort((a, b) => (b.height || 0) - (a.height || 0));

    const bestCombinedHeight = combined[0]?.height || 0;
    const bestAdaptiveHeight = adaptive[0]?.height || 0;

    // Build candidate list: if adaptive offers meaningfully better resolution
    // (≥1080p or at least 2× the combined height), put it first.
    let formats;
    if (bestAdaptiveHeight >= 1080 || bestAdaptiveHeight >= bestCombinedHeight * 1.4) {
      formats = [...adaptive.slice(0, 2), ...combined.slice(0, 2)];
    } else {
      formats = [...combined.slice(0, 2), ...adaptive.slice(0, 2)];
    }

    if (!formats.length) {
      return jsonErr("No downloadable format found for this video.");
    }

    // Try candidates in order until one streams.
    for (const fmt of formats.slice(0, 4)) {
      try {
        const file = await fetch(fmt.url, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(30000),
        });
        if (file.ok && file.body) {
          const headers = {
            ...CORS,
            "Content-Type": "video/mp4",
            "Content-Disposition": `attachment; filename="${ytId}.mp4"`,
            "Cache-Control": "no-store",
          };
          const len = file.headers.get("content-length");
          if (len) headers["Content-Length"] = len;
          return new Response(file.body, { headers });
        }
      } catch {
        /* next format */
      }
    }

    return jsonErr("Got download links but none would stream. Try again in a minute.");
  },
};
