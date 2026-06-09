// Download YouTube / Vimeo videos — no API key needed.
// YouTube: tries multiple public Invidious instances.
// Vimeo: uses public Vimeo API.
// Pro + Admin only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Public Invidious instances — tried in order until one works
const INVIDIOUS_INSTANCES = [
  "https://invidious.privacydev.net",
  "https://inv.tux.pizza",
  "https://invidious.nerdvpn.de",
  "https://invidious.io.lol",
];

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

async function getYouTubeDownloadUrl(videoId: string): Promise<string> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(
        `${instance}/api/v1/videos/${videoId}?fields=formatStreams,adaptiveFormats`,
        { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) continue;
      const data = await res.json();

      // formatStreams has combined video+audio (preferred for simple download)
      const streams: any[] = data.formatStreams || [];
      const preferred = ["1080p", "720p", "480p", "360p"];
      for (const q of preferred) {
        const f = streams.find((s: any) => s.qualityLabel === q);
        if (f?.url) return f.url;
      }
      // fallback to best available
      if (streams[0]?.url) return streams[0].url;
    } catch {
      continue;
    }
  }
  throw new Error("Could not fetch video — it may be private, age-restricted, or geo-blocked.");
}

async function getVimeoDownloadUrl(videoId: string): Promise<string> {
  const res = await fetch(`https://vimeo.com/api/v2/video/${videoId}.json`);
  if (!res.ok) throw new Error("Vimeo video not found or is private.");
  const data = await res.json();
  const url = data[0]?.url;
  if (!url) throw new Error("Could not get Vimeo download link.");
  // Return the Vimeo page link — direct stream URLs require Vimeo auth
  return url;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).maybeSingle();
  const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (profile?.plan !== "paid" && !isAdmin) {
    return new Response(JSON.stringify({ error: "Pro subscription required" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { url } = await req.json().catch(() => ({ url: "" }));
  if (!url) {
    return new Response(JSON.stringify({ error: "url is required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const ytId = extractYouTubeId(url);
    if (ytId) {
      const downloadUrl = await getYouTubeDownloadUrl(ytId);
      return new Response(JSON.stringify({ downloadUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vimeoId = extractVimeoId(url);
    if (vimeoId) {
      const downloadUrl = await getVimeoDownloadUrl(vimeoId);
      return new Response(JSON.stringify({ downloadUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Only YouTube and Vimeo URLs are supported" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
