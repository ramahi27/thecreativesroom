// Are.na importer — bulk-adds blocks from public Are.na channels (clean JSON, no scraping).
// Streams NDJSON progress. Inserts into references as published=false drafts.
// No key needed for public channels. Optional secret: ARENA_ACCESS_TOKEN (for private channels).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  channels?: string[];    // channel slugs, e.g. ["arena-influences", "graphic-design-abc"]
  perChannel?: number;    // max blocks per channel (default 100)
}

interface ArenaBlock {
  id: number;
  class: string;          // Image | Link | Media | Attachment | Text
  title: string | null;
  generated_title: string | null;
  image: { thumb?: { url: string }; display?: { url: string }; original?: { url: string } } | null;
  source: { url: string | null; title: string | null } | null;
}

// Slug-ify a channel URL or raw slug into the bare slug Are.na expects.
function normalizeSlug(input: string): string {
  const s = input.trim();
  const m = s.match(/are\.na\/[^/]+\/([^/?#]+)/i);
  return (m ? m[1] : s).replace(/^\/+|\/+$/g, "");
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
  const { data: roleRow } = await userClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body: Body = await req.json().catch(() => ({}));
  const channels = (body.channels ?? []).map(normalizeSlug).filter(Boolean);
  const perChannel = Math.min(Math.max(body.perChannel ?? 100, 1), 400);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      const summary = { total_fetched: 0, saved: 0, skipped_duplicates: 0, skipped_no_image: 0, errors: 0 };

      if (channels.length === 0) {
        send({ type: "error", message: "No channel slugs provided (e.g. arena-influences)" });
        controller.close();
        return;
      }

      const token = Deno.env.get("ARENA_ACCESS_TOKEN") ?? "";
      const headers: Record<string, string> = { "Accept": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      try {
        for (const slug of channels) {
          let remaining = perChannel;
          let page = 1;
          send({ type: "progress", message: `Fetching Are.na channel "${slug}"…` });

          while (remaining > 0) {
            const per = Math.min(remaining, 100);
            let blocks: ArenaBlock[] = [];
            try {
              const resp = await fetch(
                `https://api.are.na/v2/channels/${encodeURIComponent(slug)}/contents?per=${per}&page=${page}&direction=desc`,
                { headers, signal: AbortSignal.timeout(20000) },
              );
              if (!resp.ok) {
                send({ type: "warn", message: `Are.na "${slug}" p${page}: HTTP ${resp.status}${resp.status === 404 ? " (channel not found / private)" : ""}` });
                summary.errors++;
                break;
              }
              const json = await resp.json();
              blocks = json.contents ?? [];
            } catch (e) {
              send({ type: "warn", message: `Are.na "${slug}" p${page}: ${(e as Error).message}` });
              summary.errors++;
              break;
            }

            if (blocks.length === 0) {
              send({ type: "progress", message: `"${slug}": no more blocks` });
              break;
            }
            summary.total_fetched += blocks.length;

            for (const b of blocks) {
              const thumbnail_url = b.image?.display?.url || b.image?.original?.url || b.image?.thumb?.url;
              if (!thumbnail_url) { summary.skipped_no_image++; continue; } // skip text/non-image blocks
              const source_url = b.source?.url || `https://www.are.na/block/${b.id}`;

              const { data: existing } = await supabase
                .from("references").select("id").eq("source_url", source_url).maybeSingle();
              if (existing) { summary.skipped_duplicates++; continue; }

              const { error } = await supabase.from("references").insert({
                title: b.title?.trim() || b.generated_title?.trim() || b.source?.title?.trim() || "Are.na block",
                type: "image",
                source_url,
                thumbnail_url,
                media_url: b.image?.original?.url || thumbnail_url,
                media_items: [],
                brand: null,
                agency: null,
                year: null,
                categories: [],
                tags: [slug.toLowerCase(), "are.na"],
                notes: `Are.na — channel “${slug}”`,
                created_by: user.id,
                published: false,
                source: "arena",
              });
              if (error) {
                if ((error as any).code === "23505") summary.skipped_duplicates++;
                else { summary.errors++; send({ type: "warn", message: `Insert failed: ${error.message}` }); }
                continue;
              }
              summary.saved++;
            }

            send({ type: "progress", message: `✓ "${slug}" page ${page} — ${blocks.length} blocks (${summary.saved} saved so far)` });
            remaining -= blocks.length;
            if (blocks.length < per) break;
            page++;
          }
        }
        send({ type: "done", summary });
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "application/x-ndjson" },
  });
});
