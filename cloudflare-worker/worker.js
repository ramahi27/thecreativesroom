// YouTube download proxy.
// Primary: yt-dlp server on Railway — returns 1080p with merged audio.
// Fallback: RapidAPI YT-API — returns 720p with audio.
//
// Required Worker secrets (Cloudflare dashboard → Worker → Settings → Variables):
//   YTDLP_URL    — your Railway server URL e.g. https://your-app.up.railway.app
//   YTDLP_SECRET — matches YTD_SECRET on the Railway server
//   RAPIDAPI_KEY — your RapidAPI key (fallback)

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

// ── Primary: yt-dlp server (1080p + audio) ───────────────────────────────────
async function tryYtdlp(ytdlpUrl, secret, url) {
  try {
    const r = await fetch(`${ytdlpUrl}/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Secret": secret || "",
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(25000), // must be < 30s (Cloudflare Worker free plan wall-clock limit)
    });
    if (r.ok && r.body) return r;
    return null;
  } catch {
    return null;
  }
}

// ── Fallback: RapidAPI (720p + audio) ────────────────────────────────────────
async function tryRapidApi(apiKey, url, ytId) {
  try {
    const r = await fetch(`https://${RAPIDAPI_HOST}/dl?id=${ytId}&cgeo=US`, {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": RAPIDAPI_HOST,
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const info = await r.json();
    if (info.status && info.status !== "OK") return null;

    const formats = (info.formats || [])
      .filter((f) => f.url && (f.mimeType || "").includes("mp4"))
      .sort((a, b) => {
        const aIs720 = a.itag == 22 || a.qualityLabel === "720p" ? 1 : 0;
        const bIs720 = b.itag == 22 || b.qualityLabel === "720p" ? 1 : 0;
        if (bIs720 !== aIs720) return bIs720 - aIs720;
        return (b.height || 0) - (a.height || 0);
      });

    for (const fmt of formats.slice(0, 3)) {
      try {
        const file = await fetch(fmt.url, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(30000),
        });
        if (file.ok && file.body) return file;
      } catch { /* next */ }
    }
    return null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
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

    // 1) Try yt-dlp server first (1080p + audio)
    if (env.YTDLP_URL) {
      const res = await tryYtdlp(env.YTDLP_URL, env.YTDLP_SECRET || "", url);
      if (res) {
        const headers = {
          ...CORS,
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="${ytId}.mp4"`,
          "Cache-Control": "no-store",
        };
        const len = res.headers.get("content-length");
        if (len) headers["Content-Length"] = len;
        return new Response(res.body, { headers });
      }
    }

    // 2) Fallback: RapidAPI (720p + audio)
    if (env.RAPIDAPI_KEY) {
      const res = await tryRapidApi(env.RAPIDAPI_KEY, url, ytId);
      if (res) {
        const headers = {
          ...CORS,
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="${ytId}.mp4"`,
          "Cache-Control": "no-store",
        };
        const len = res.headers.get("content-length");
        if (len) headers["Content-Length"] = len;
        return new Response(res.body, { headers });
      }
    }

    return jsonErr("All download sources are unavailable right now.");
  },
};
