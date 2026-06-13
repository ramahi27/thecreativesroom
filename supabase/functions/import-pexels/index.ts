// Pexels importer — bulk-adds photos via the official Pexels API (clean JSON, no scraping).
// Streams NDJSON progress. Inserts into references as published=false drafts.
// Requires secret: PEXELS_API_KEY  (free key at https://www.pexels.com/api/)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  queries?: string[];     // search terms, e.g. ["minimalist poster", "brutalist architecture"]
  perQuery?: number;      // how many photos per query (default 40, max 80/page → we page)
  orientation?: string;   // landscape | portrait | square (optional)
}

interface PexelsPhoto {
  id: number;
  url: string;
  photographer: string;
  alt: string;
  src: { original: string; large2x: string; large: string; medium: string };
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
  const queries = (body.queries ?? []).map((q) => q.trim()).filter(Boolean);
  const perQuery = Math.min(Math.max(body.perQuery ?? 40, 1), 80);
  const orientation = body.orientation;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      const summary = { total_fetched: 0, saved: 0, skipped_duplicates: 0, skipped_no_image: 0, errors: 0 };

      const apiKey = Deno.env.get("PEXELS_API_KEY") ?? "";
      if (!apiKey) {
        send({ type: "error", message: "PEXELS_API_KEY not set — add it in Cloud → Secrets (free key at pexels.com/api)" });
        controller.close();
        return;
      }
      if (queries.length === 0) {
        send({ type: "error", message: "No search terms provided" });
        controller.close();
        return;
      }

      try {
        for (const query of queries) {
          let remaining = perQuery;
          let page = 1;
          send({ type: "progress", message: `Searching Pexels for "${query}"…` });

          while (remaining > 0) {
            const pageSize = Math.min(remaining, 80);
            const params = new URLSearchParams({
              query, per_page: String(pageSize), page: String(page),
            });
            if (orientation) params.set("orientation", orientation);

            let photos: PexelsPhoto[] = [];
            try {
              const resp = await fetch(`https://api.pexels.com/v1/search?${params}`, {
                headers: { Authorization: apiKey },
                signal: AbortSignal.timeout(20000),
              });
              if (!resp.ok) {
                send({ type: "warn", message: `Pexels "${query}" p${page}: HTTP ${resp.status}` });
                summary.errors++;
                break;
              }
              const json = await resp.json();
              photos = json.photos ?? [];
            } catch (e) {
              send({ type: "warn", message: `Pexels "${query}" p${page}: ${(e as Error).message}` });
              summary.errors++;
              break;
            }

            if (photos.length === 0) {
              send({ type: "progress", message: `"${query}": no more results` });
              break;
            }
            summary.total_fetched += photos.length;

            for (const p of photos) {
              const thumbnail_url = p.src?.large || p.src?.large2x || p.src?.medium;
              if (!thumbnail_url) { summary.skipped_no_image++; continue; }
              const source_url = p.url;

              const { data: existing } = await supabase
                .from("references").select("id").eq("source_url", source_url).maybeSingle();
              if (existing) { summary.skipped_duplicates++; continue; }

              const { error } = await supabase.from("references").insert({
                title: p.alt?.trim() || `Photo by ${p.photographer}`,
                type: "image",
                source_url,
                thumbnail_url,
                media_url: p.src?.original || thumbnail_url,
                media_items: [],
                brand: null,
                agency: p.photographer || null,
                year: null,
                categories: [],
                tags: [query.toLowerCase(), "pexels", "photography"],
                notes: `Pexels — “${query}” · © ${p.photographer}`,
                created_by: user.id,
                published: false,
                source: "pexels",
              });
              if (error) {
                if ((error as any).code === "23505") summary.skipped_duplicates++;
                else { summary.errors++; send({ type: "warn", message: `Insert failed: ${error.message}` }); }
                continue;
              }
              summary.saved++;
            }

            send({ type: "progress", message: `✓ "${query}" page ${page} — ${photos.length} fetched (${summary.saved} saved so far)` });
            remaining -= photos.length;
            if (photos.length < pageSize) break; // no more pages
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
