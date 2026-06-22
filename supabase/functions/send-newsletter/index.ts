import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    // Validate JWT with anon key
    const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: "Invalid token" }, 401);

    // Admin check via service role
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const subject = String(body.subject || "").trim();
    const html = String(body.html || "").trim();
    const preview = String(body.preview || "").trim();
    const testEmail = typeof body.testEmail === "string" ? body.testEmail.trim() : null;

    if (!subject) return json({ error: "Subject required" }, 400);
    if (!html) return json({ error: "Body required" }, 400);

    let emails: string[];

    if (testEmail) {
      emails = [testEmail];
    } else {
      // Fetch all user emails
      const { data: users, error: usersErr } = await (supabase as any).rpc("get_user_overview");
      if (usersErr) return json({ error: usersErr.message }, 500);
      emails = (Array.isArray(users) ? users : [])
        .map((u: any) => u.email)
        .filter((e: any): e is string => typeof e === "string" && e.includes("@"));
    }

    if (emails.length === 0) return json({ error: "No emails found" }, 400);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ error: "RESEND_API_KEY not configured" }, 500);

    const from = Deno.env.get("NEWSLETTER_FROM") || "The Creatives Room <hello@thecreativesroom.com>";

    // Resend allows max 100 per batch call — chunk if needed
    const BATCH = 100;
    let sent = 0;
    for (let i = 0; i < emails.length; i += BATCH) {
      const chunk = emails.slice(i, i + BATCH);
      const messages = chunk.map((to) => ({
        from,
        to,
        subject,
        html: preview ? `<div style="display:none;max-height:0;overflow:hidden;">${preview}</div>${html}` : html,
      }));

      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });

      if (!res.ok) {
        const err = await res.text();
        return json({ error: `Resend error: ${err}`, sent }, res.status);
      }
      sent += chunk.length;
    }

    return json({ sent });
  } catch (e: any) {
    return json({ error: e?.message ?? "Unknown error" }, 500);
  }
});
