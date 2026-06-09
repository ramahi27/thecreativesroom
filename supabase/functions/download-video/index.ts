import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function isAllowedUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace("www.", "");
    return (
      h.includes("youtube.com") ||
      h === "youtu.be" ||
      h.includes("vimeo.com")
    );
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  // Pro gate: paid plan or admin role
  const [{ data: profile }, { data: adminRole }] = await Promise.all([
    supabase.from("profiles").select("plan").eq("user_id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
  ]);

  if (profile?.plan !== "paid" && !adminRole) {
    return json({ error: "Pro subscription required" }, 403);
  }

  const { url } = await req.json();
  if (!url || !isAllowedUrl(url)) {
    return json({ error: "Invalid or unsupported URL" }, 400);
  }

  // Call Cobalt API to get a download-ready URL
  const cobaltRes = await fetch("https://api.cobalt.tools/", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, vQuality: "max" }),
  });

  const cobalt = await cobaltRes.json();

  if (!cobaltRes.ok || cobalt.status === "error" || !cobalt.url) {
    return json({ error: cobalt.text || "Could not process video" }, 502);
  }

  return json({ downloadUrl: cobalt.url });
});
