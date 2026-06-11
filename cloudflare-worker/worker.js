// YouTube download proxy — Pro users only.
// Required Worker secrets:
//   YTDLP_URL, YTDLP_SECRET, RAPIDAPI_KEY
//   SUPABASE_URL, SUPABASE_ANON_KEY

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

async function tryYtdlp(ytdlpUrl, secret, url) {
  try {
    const r = await fetch(`${ytdlpUrl}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Secret": secret || "" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(25000),
    });
    if (r.ok && r.body) return r;
    return null;
  } catch {
    return null;
  }
}

async function tryRapidApi(apiKey, url, ytId) {
  try {
    const r = await fetch(`https://${RAPIDAPI_HOST}/dl?id=${ytId}&cgeo=US`, {
      headers: { "x-rapidapi-key": apiKey, "x-rapidapi-host": RAPIDAPI_HOST },
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

// Returns { valid: bool, userId: string|null }
async function verifyToken(supabaseUrl, anonKey, token) {
  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { "Authorization": `Bearer ${token}`, "apikey": anonKey },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return { valid: false, userId: null };
    const u = await r.json();
    return { valid: true, userId: u.id };
  } catch {
    return { valid: false, userId: null };
  }
}

// Returns true if user has paid plan OR admin role
async function checkProAccess(supabaseUrl, anonKey, token, userId) {
  try {
    const [profileRes, roleRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/profiles?select=plan&user_id=eq.${userId}&limit=1`, {
        headers: { "Authorization": `Bearer ${token}`, "apikey": anonKey },
        signal: AbortSignal.timeout(4000),
      }),
      fetch(`${supabaseUrl}/rest/v1/user_roles?select=role&user_id=eq.${userId}&role=eq.admin&limit=1`, {
        headers: { "Authorization": `Bearer ${token}`, "apikey": anonKey },
        signal: AbortSignal.timeout(4000),
      }),
    ]);
    if (profileRes.ok) {
      const rows = await profileRes.json();
      if (rows[0]?.plan === "paid") return true;
    }
    if (roleRes.ok) {
      const roles = await roleRes.json();
      if (roles.length > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST")
      return new Response("Method not allowed", { status: 405, headers: CORS });

    const authHeader = request.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return jsonErr("Unauthorized", 401);

    let url;
    try {
      ({ url } = await request.json());
    } catch {
      return jsonErr("Invalid request body", 400);
    }

    const ytId = extractId(url || "");
    if (!ytId) return jsonErr("Invalid YouTube URL", 400);

    // Run auth + yt-dlp in parallel to stay within the 30s wall-clock limit.
    const [authResult, ytdlpRes] = await Promise.all([
      env.SUPABASE_URL && env.SUPABASE_ANON_KEY
        ? verifyToken(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, token)
        : Promise.resolve({ valid: true, userId: null }),
      env.YTDLP_URL ? tryYtdlp(env.YTDLP_URL, env.YTDLP_SECRET || "", url) : Promise.resolve(null),
    ]);

    if (!authResult.valid) return jsonErr("Unauthorized", 401);

    // Check Pro subscription (runs after auth resolves, yt-dlp already ran in parallel)
    if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY && authResult.userId) {
      const isPro = await checkProAccess(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, token, authResult.userId);
      if (!isPro) return jsonErr("Pro subscription required to download videos.", 403);
    }

    if (ytdlpRes) {
      const headers = {
        ...CORS,
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${ytId}.mp4"`,
        "Cache-Control": "no-store",
      };
      const len = ytdlpRes.headers.get("content-length");
      if (len) headers["Content-Length"] = len;
      return new Response(ytdlpRes.body, { headers });
    }

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
