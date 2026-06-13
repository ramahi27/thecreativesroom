// Admin-only edge function: returns all users with plan, role, ref counts, and time spent.
// Uses the service role key so it bypasses RLS on the profiles table.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing auth" }, 401);

  // Verify caller is an admin using the anon client (respects RLS)
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
  if (userErr || !userData.user) return json({ error: "Invalid token" }, 401);

  const { data: roleRow } = await anonClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return json({ error: "Admin only" }, 403);

  // Use service role to bypass RLS for the actual data fetch
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const [profilesRes, rolesRes, refsRes, viewsRes] = await Promise.all([
    admin.from("profiles").select("user_id, username, created_at, plan").limit(1000),
    admin.from("user_roles").select("user_id").eq("role", "admin").limit(1000),
    admin.from("references").select("created_by, approved_by").eq("published", true).limit(10000),
    admin.from("page_views").select("user_id, duration_seconds").not("user_id", "is", null).limit(20000),
  ]);

  const firstError = profilesRes.error || rolesRes.error || refsRes.error || viewsRes.error;
  if (firstError) return json({ error: firstError.message }, 500);

  const adminIds = new Set((rolesRes.data || []).map((r: any) => r.user_id));

  const addedBy = new Map<string, number>();
  const approvedBy = new Map<string, number>();
  for (const r of refsRes.data || []) {
    if (r.created_by) addedBy.set(r.created_by, (addedBy.get(r.created_by) || 0) + 1);
    if (r.approved_by) approvedBy.set(r.approved_by, (approvedBy.get(r.approved_by) || 0) + 1);
  }

  const timeBy = new Map<string, number>();
  for (const v of viewsRes.data || []) {
    if (v.user_id) timeBy.set(v.user_id, (timeBy.get(v.user_id) || 0) + (v.duration_seconds || 0));
  }

  const users = (profilesRes.data || [])
    .map((p: any) => ({
      user_id: p.user_id,
      username: p.username,
      created_at: p.created_at,
      is_admin: adminIds.has(p.user_id),
      plan: p.plan || "free",
      references_added: addedBy.get(p.user_id) || 0,
      references_approved: approvedBy.get(p.user_id) || 0,
      time_spent_seconds: timeBy.get(p.user_id) || 0,
    }))
    .sort((a: any, b: any) => +new Date(b.created_at) - +new Date(a.created_at));

  return json({ users });
});
