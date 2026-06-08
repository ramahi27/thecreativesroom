import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Stale after 7 days
const STALE_DAYS = 7;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  // Require admin auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return new Response("Unauthorized", { status: 401 });

  // Check admin via user_roles (same table useAuth checks on the client)
  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) return new Response("Forbidden", { status: 403 });

  // Pick references that haven't been checked yet or are stale
  const staleDate = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: refs, error } = await supabase
    .from("references")
    .select("id, source_url, link_status, link_checked_at")
    .or(`link_checked_at.is.null,link_checked_at.lt.${staleDate}`)
    .not("source_url", "is", null);

  const cors = { "Access-Control-Allow-Origin": "*" };
  if (error) return Response.json({ error: error.message }, { status: 500, headers: cors });
  if (!refs || refs.length === 0) {
    return Response.json({ checked: 0, dead: 0, ok: 0, message: "All links are up to date." }, { headers: cors });
  }

  let ok = 0;
  let dead = 0;
  let errored = 0;

  await Promise.all(
    refs.map(async (ref) => {
      let status: "ok" | "dead" | "error" = "error";
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(ref.source_url, {
          method: "HEAD",
          signal: controller.signal,
          redirect: "follow",
          headers: { "User-Agent": "Mozilla/5.0 (compatible; TCR-LinkChecker/1.0)" },
        });
        clearTimeout(timeout);
        // 2xx or 3xx = alive; 404, 410 = dead; others = treat as ok (may block HEAD)
        if (res.status === 404 || res.status === 410) {
          status = "dead";
        } else {
          status = "ok";
        }
      } catch {
        // Timeout or network error — mark as error, not dead (might be a bot block)
        status = "error";
      }

      if (status === "ok") ok++;
      else if (status === "dead") dead++;
      else errored++;

      await supabase
        .from("references")
        .update({ link_status: status, link_checked_at: new Date().toISOString() })
        .eq("id", ref.id);
    }),
  );

  return Response.json({
    checked: refs.length,
    ok,
    dead,
    errored,
    message: `Checked ${refs.length} links — ${dead} dead, ${errored} errors, ${ok} ok.`,
  }, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
});
