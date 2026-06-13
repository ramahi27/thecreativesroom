// Unsplash importer — bulk-adds photos via the official Unsplash API (clean JSON, no scraping).
// Streams NDJSON progress. Inserts into references as published=false drafts.
// Requires secret: UNSPLASH_ACCESS_KEY  (free key at https://unsplash.com/developers)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  queries?: string[];     // search terms
  perQuery?: number;      // photos per query (default 30; Unsplash caps per_page at 30 → we page)
  orientation?: string;   // landscape | portrait | squarish (optional)
}

interface UnsplashPhoto {
  id: string;
  description: string | null;
  alt_description: string | null;
  urls: { raw: string; full: string; regular: string; small: string };
  links: { html: string };
  user: { name: string };
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
  const perQuery = Math.min(Math.max(body.perQuery ?? 30, 1), 90);
  const orientation = body.orientation;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      const summary = { total_fetched: 0, saved: 0, skipped_duplicates: 0, skipped_no_image: 0, errors: 0 };

      const apiKey = Deno.env.get("UNSPLASH_ACCESS_KEY") ?? "";
      if (!apiKey) {
        send({ type: "error", message: "UNSPLASH_ACCESS_KEY not set — add it in Cloud → Secrets (free key at unsplash.com/developers)" });
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
          send({ type: "progress", message: `Searching Unsplash for "${query}"…` });

          while (remaining > 0) {
            const pageSize = Math.min(remaining, 30); // Unsplash max per_page = 30
            const params = new URLSearchParams({
              query, per_page: String(pageSize), page: String(page),
            });
            if (orientation) params.set("orientation", orientation);

            let photos: UnsplashPhoto[] = [];
            try {
              const resp = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
                headers: { Authorization: `Client-ID ${apiKey}`, "Accept-Version": "v1" },
                signal: AbortSignal.timeout(20000),
              });
              if (!resp.ok) {
                send({ type: "warn", message: `Unsplash "${query}" p${page}: HTTP ${resp.status}` });
                summary.errors++;
                break;
              }
              const json = await resp.json();
              photos = json.results ?? [];
            } catch (e) {
              send({ type: "warn", message: `Unsplash "${query}" p${page}: ${(e as Error).message}` });
              summary.errors++;
              break;
            }

            if (photos.length === 0) {
              send({ type: "progress", message: `"${query}": no more results` });
              break;
            }
            summary.total_fetched += photos.length;

            for (const p of photos) {
              const thumbnail_url = p.urls?.regular || p.urls?.small;
              if (!thumbnail_url) { summary.skipped_no_image++; continue; }
              const source_url = p.links?.html || `https://unsplash.com/photos/${p.id}`;

              const { data: existing } = await supabase
                .from("references").select("id").eq("source_url", source_url).maybeSingle();
              if (existing) { summary.skipped_duplicates++; continue; }

              const { error } = await supabase.from("references").insert({
                title: p.description?.trim() || p.alt_description?.trim() || `Photo by ${p.user?.name ?? "Unknown"}`,
                type: "image",
                source_url,
                thumbnail_url,
                media_url: p.urls?.full || p.urls?.raw || thumbnail_url,
                media_items: [],
                brand: null,
                agency: p.user?.name || null,
                year: null,
                categories: [],
                tags: [query.toLowerCase(), "unsplash", "photography"],
                notes: `Unsplash — “${query}” · © ${p.user?.name ?? "Unknown"}`,
                created_by: user.id,
                published: false,
                source: "unsplash",
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
            if (photos.length < pageSize) break;
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
