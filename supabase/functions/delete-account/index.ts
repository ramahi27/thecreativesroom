import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Verify user from JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return new Response("Unauthorized", { status: 401 });

  const uid = user.id;

  try {
    // 1. Delete folder items (FK to folders + references)
    await supabase.from("folder_items").delete().eq("user_id", uid);

    // 2. Delete folders
    await supabase.from("folders").delete().eq("user_id", uid);

    // 3. Delete bookmarks
    await supabase.from("bookmarks").delete().eq("user_id", uid);

    // 4. Delete brief / search usage records
    await supabase.from("brief_usages").delete().eq("user_id", uid);

    // 5. Anonymise references they submitted (don't delete — content stays)
    await supabase
      .from("references")
      .update({ created_by: null })
      .eq("created_by", uid);

    // 6. Delete profile row
    await supabase.from("profiles").delete().eq("user_id", uid);

    // 7. Delete the auth user (requires service role)
    const { error: deleteErr } = await supabase.auth.admin.deleteUser(uid);
    if (deleteErr) throw deleteErr;

    return Response.json({ success: true }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (err: any) {
    return Response.json({ error: err.message ?? "Deletion failed" }, {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
});
