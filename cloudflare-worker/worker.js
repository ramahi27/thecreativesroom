// YouTube download proxy — RapidAPI edition.
// Uses combined audio+video streams only (720p max with audio).
// 1080p+audio requires server-side ffmpeg merging which Workers can't do.

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

    if (!env.RAPIDAPI_KEY)
      return jsonErr("Server not configured: missing RAPIDAPI_KEY secret.", 500);

    let url;
    try {
      ({ url } = await request.json());
    } catch {
      return jsonErr("Invalid request body", 400);
    }

    const ytId = extractId(url || "");
    if (!ytId) return jsonErr("Invalid YouTube URL", 400);

    let info;
    try {
      const r = await fetch(`https://${RAPIDAPI_HOST}/dl?id=${ytId}&cgeo=US`, {
        headers: {
          "x-rapidapi-key": env.RAPIDAPI_KEY,
          "x-rapidapi-host": RAPIDAPI_HOST,
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) {
        if (r.status === 429) return jsonErr("Download quota reached for this month.", 429);
        return jsonErr(`Downloader API error (${r.status}).`);
      }
      info = await r.json();
    } catch {
      return jsonErr("Downloader API timed out. Try again.");
    }

    if (info.status && info.status !== "OK")
      return jsonErr(info.reason || "Video unavailable (private, deleted, or region-locked).");

    // Combined audio+video only (itag 22 = 720p, itag 18 = 360p).
    // Sort so 720p (itag 22) comes first, then by height descending.
    const formats = (info.formats || [])
      .filter((f) => f.url && (f.mimeType || "").includes("mp4"))
      .sort((a, b) => {
        // Explicit 720p first
        const aIs720 = a.itag == 22 || a.qualityLabel === "720p" ? 1 : 0;
        const bIs720 = b.itag == 22 || b.qualityLabel === "720p" ? 1 : 0;
        if (bIs720 !== aIs720) return bIs720 - aIs720;
        return (b.height || 0) - (a.height || 0);
      });

    if (!formats.length)
      return jsonErr("No downloadable format found for this video.");

    for (const fmt of formats.slice(0, 3)) {
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
      } catch { /* next format */ }
    }

    return jsonErr("Got download links but none would stream. Try again in a minute.");
  },
};
