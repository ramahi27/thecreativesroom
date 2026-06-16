import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// How many links to probe at once. Keeps us under the edge function wall-clock
// limit and avoids hammering any single host.
const CONCURRENCY = 20;
const REQUEST_TIMEOUT_MS = 8000;

type LinkStatus = "ok" | "dead" | "error";

function parseHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
    if (u.hostname === "youtu.be" || u.hostname === "www.youtu.be") return u.pathname.slice(1) || null;
    return null;
  } catch { return null; }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// Decide whether a single source URL is alive, dead, or indeterminate.
// Video platforms need special handling: a deleted YouTube/Vimeo video still
// returns 200 for the page itself, so we must ask the oEmbed API instead.
async function checkLink(url: string): Promise<LinkStatus> {
  const host = parseHost(url);

  // ── YouTube: oEmbed returns 200 if the video exists & is embeddable,
  //    401 (private / embedding disabled) or 404 (deleted) otherwise. ──────────
  if (host.includes("youtube.com") || host === "youtu.be") {
    const id = youtubeId(url);
    if (!id) return "error";
    try {
      const res = await fetchWithTimeout(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
      );
      if (res.status === 200) return "ok";
      if (res.status === 401 || res.status === 403 || res.status === 404) return "dead";
      return "error";
    } catch {
      return "error";
    }
  }

  // ── Vimeo: oEmbed returns 200 if alive, 404 if removed. ────────────────────
  if (host.includes("vimeo.com")) {
    try {
      const res = await fetchWithTimeout(
        `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
      );
      if (res.status === 200) return "ok";
      if (res.status === 404 || res.status === 403) return "dead";
      return "error";
    } catch {
      return "error";
    }
  }

  // ── Everything else: HEAD, fall back to GET if HEAD is blocked. ────────────
  try {
    let res = await fetchWithTimeout(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TCR-LinkChecker/1.0)" },
    });
    // Some hosts reject HEAD (405) — retry once with GET before judging.
    if (res.status === 405 || res.status === 501) {
      res = await fetchWithTimeout(url, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TCR-LinkChecker/1.0)" },
      });
    }
    if (res.status === 404 || res.status === 410) return "dead";
    return "ok";
  } catch {
    // Timeout or network error — not necessarily dead (could be a bot block).
    return "error";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  const cors = { "Access-Control-Allow-Origin": "*" };

  // Require admin auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return new Response("Unauthorized", { status: 401 });

  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) return new Response("Forbidden", { status: 403 });

  // Check every reference that has a source URL. Order by link_checked_at
  // NULLS FIRST so never-checked rows (including drafts) get processed before
  // we re-verify already-known links. This guarantees the whole archive gets
  // covered across runs even if a single invocation hits the wall-clock limit.
  const { data: refs, error } = await supabase
    .from("references")
    .select("id, source_url")
    .not("source_url", "is", null)
    .order("link_checked_at", { ascending: true, nullsFirst: true })
    .limit(10000);

  if (error) return Response.json({ error: error.message }, { status: 500, headers: cors });
  if (!refs || refs.length === 0) {
    return Response.json({ checked: 0, dead: 0, ok: 0, errored: 0, message: "No links to check." }, { headers: cors });
  }

  let ok = 0, dead = 0, errored = 0;
  const now = new Date().toISOString();

  // Process in bounded-concurrency chunks so we cover the whole archive
  // without firing thousands of requests at once.
  for (let i = 0; i < refs.length; i += CONCURRENCY) {
    const chunk = refs.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (ref) => {
        const status = await checkLink(ref.source_url);
        if (status === "ok") ok++;
        else if (status === "dead") dead++;
        else errored++;
        await supabase
          .from("references")
          .update({ link_status: status, link_checked_at: now })
          .eq("id", ref.id);
      }),
    );
  }

  return Response.json({
    checked: refs.length,
    ok,
    dead,
    errored,
    message: `Checked ${refs.length} links - ${dead} dead, ${errored} errors, ${ok} ok.`,
  }, { headers: cors });
});
