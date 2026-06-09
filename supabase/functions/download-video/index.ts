// Download YouTube / Vimeo videos via Cobalt.tools API.
// Pro + Admin only. Returns { downloadUrl } on success.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_HOSTS = ["youtube.com", "www.youtube.com", "youtu.be", "vimeo.com", "www.vimeo.com"];

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

  let parsed: URL;
  try { parsed = new URL(url); } catch {
    return new Response(JSON.stringify({ error: "Invalid URL" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return new Response(JSON.stringify({ error: "Only YouTube and Vimeo URLs are supported" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const cobaltApiKey = Deno.env.get("COBALT_API_KEY");
  const cobaltHeaders: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/json",
  };
  if (cobaltApiKey) cobaltHeaders["Authorization"] = `Api-Key ${cobaltApiKey}`;

  try {
    const cobaltRes = await fetch("https://api.cobalt.tools/", {
      method: "POST",
      headers: cobaltHeaders,
      body: JSON.stringify({ url, vQuality: "max" }),
    });
    const cobaltData = await cobaltRes.json();
    if (!cobaltRes.ok || cobaltData.status === "error" || !cobaltData.url) {
      const msg = cobaltData.error?.code || cobaltData.text || "Could not get download link";
      return new Response(JSON.stringify({ error: msg }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ downloadUrl: cobaltData.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
