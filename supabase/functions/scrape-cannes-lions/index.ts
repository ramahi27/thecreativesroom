// Cannes Lions scraper (lovethework.com) — streams progress via NDJSON.
// Standalone: does not touch any other scraper or table besides public.pending_refs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  yearFrom?: number;
  yearTo?: number;
  awardLevels?: string[]; // "grand-prix" | "gold"
  categories?: string[];  // film | print | photography | outdoor | craft
  autoApproveGrandPrix?: boolean;
}

interface Scraped {
  title: string;
  brand: string;
  agency: string;
  category: string;
  award_level: string;
  image_url: string | null;
  source_url: string;
  year: number | null;
  format: "video" | "photo";
  tags: string[];
  curatorial_note: string;
}

function buildUrls(yearFrom: number, yearTo: number, awards: string[]) {
  const urls: { url: string; year: number; award: string }[] = [];
  for (let y = yearTo; y >= yearFrom; y--) {
    for (const a of awards) {
      urls.push({
        url: `https://www.lovethework.com/en-GB/awards?award=${a}&year=${y}`,
        year: y,
        award: a,
      });
    }
  }
  return urls;
}

// Lightweight HTML parser using regex — extracts cards.
function parsePage(html: string, year: number, award: string, targetCats: string[]): Scraped[] {
  const out: Scraped[] = [];
  // Match anchor/article blocks heuristically.
  const blockRegex = /<(?:article|div)[^>]*class="[^"]*(?:work-card|entry-card|award-entry|WorkCard|EntryCard)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div)>/gi;
  let m: RegExpExecArray | null;
  const matches: string[] = [];
  while ((m = blockRegex.exec(html)) !== null) matches.push(m[0]);

  // Fallback: try <a> tags pointing to work pages.
  if (matches.length === 0) {
    const linkRegex = /<a[^>]+href="(\/en-GB\/work\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = linkRegex.exec(html)) !== null) matches.push(m[0]);
  }

  const txt = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  for (const block of matches) {
    const titleM = block.match(/<(?:h[1-4]|[^>]*class="[^"]*title[^"]*")[^>]*>([\s\S]*?)<\//i);
    const brandM = block.match(/class="[^"]*(?:brand|client|advertiser)[^"]*"[^>]*>([\s\S]*?)</i);
    const agencyM = block.match(/class="[^"]*agency[^"]*"[^>]*>([\s\S]*?)</i);
    const catM = block.match(/class="[^"]*(?:category|award-type|sector)[^"]*"[^>]*>([\s\S]*?)</i);
    const imgM = block.match(/<img[^>]+(?:data-src|src)="([^"]+)"/i)
      || block.match(/background-image:\s*url\(['"]?([^'")]+)/i);
    const hrefM = block.match(/href="([^"]+)"/i);

    const title = titleM ? txt(titleM[1]) : "";
    const brand = brandM ? txt(brandM[1]) : "";
    const agency = agencyM ? txt(agencyM[1]) : "";
    const category = catM ? txt(catM[1]) : "";
    const imageUrl = imgM ? imgM[1] : null;
    const rawHref = hrefM ? hrefM[1] : "";
    const sourceUrl = rawHref.startsWith("http")
      ? rawHref
      : rawHref ? `https://www.lovethework.com${rawHref}` : "";

    const catLower = category.toLowerCase();
    const isTarget = targetCats.some((c) => catLower.includes(c.toLowerCase()));
    if (!title || !isTarget || !sourceUrl) continue;

    out.push({
      title,
      brand,
      agency,
      category,
      award_level: award === "grand-prix" ? "Grand Prix" : "Gold Lion",
      image_url: imageUrl,
      source_url: sourceUrl,
      year,
      format: catLower.includes("film") || catLower.includes("craft") ? "video" : "photo",
      tags: [
        "cannes lions",
        award === "grand-prix" ? "grand prix" : "gold lion",
        category.toLowerCase(),
      ].filter(Boolean),
      curatorial_note: `Cannes Lions ${award === "grand-prix" ? "Grand Prix" : "Gold Lion"} winner ${year} — ${category}`,
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth check: only admins.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const { data: roleRow } = await userClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!roleRow) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const body: Body = await req.json().catch(() => ({}));
  const yearFrom = body.yearFrom ?? 2010;
  const yearTo = body.yearTo ?? 2025;
  const awards = (body.awardLevels && body.awardLevels.length ? body.awardLevels : ["grand-prix", "gold"]);
  const categories = (body.categories && body.categories.length ? body.categories : ["film", "print", "photography", "outdoor"]);
  const autoApprove = body.autoApproveGrandPrix ?? true;

  const urls = buildUrls(yearFrom, yearTo, awards);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      const summary = {
        total_fetched: 0,
        auto_published: 0,
        sent_to_review: 0,
        skipped_duplicates: 0,
        skipped_no_image: 0,
        skipped_invalid: 0,
        errors: 0,
      };

      try {
        for (const { url, year, award } of urls) {
          const label = `${award === "grand-prix" ? "Grand Prix" : "Gold Lion"} ${year}`;
          send({ type: "progress", message: `Fetching ${label}...`, url });

          let html = "";
          try {
            const resp = await fetch(url, {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml",
              },
            });
            if (!resp.ok) {
              summary.errors++;
              send({ type: "warn", message: `${label}: HTTP ${resp.status}` });
              continue;
            }
            html = await resp.text();
          } catch (e) {
            summary.errors++;
            send({ type: "warn", message: `${label}: fetch failed (${(e as Error).message})` });
            continue;
          }

          const results = parsePage(html, year, award, categories);
          summary.total_fetched += results.length;

          for (const r of results) {
            if (!r.image_url) { summary.skipped_no_image++; continue; }
            if (!r.title) { summary.skipped_invalid++; continue; }
            if (!r.year || r.year < 1990 || r.year > 2025) { summary.skipped_invalid++; continue; }

            // Dedupe against pending_refs + references.
            const { data: existingPending } = await supabase
              .from("pending_refs").select("id").eq("source_url", r.source_url).maybeSingle();
            if (existingPending) { summary.skipped_duplicates++; continue; }
            const { data: existingRef } = await supabase
              .from("references").select("id").eq("source_url", r.source_url).maybeSingle();
            if (existingRef) { summary.skipped_duplicates++; continue; }

            const status = r.award_level === "Grand Prix" && autoApprove ? "published" : "draft";
            const { error } = await supabase.from("pending_refs").insert({
              source_url: r.source_url,
              image_url: r.image_url,
              title: r.title,
              brand: r.brand || null,
              agency: r.agency || null,
              category: r.category || null,
              award_level: r.award_level,
              year: r.year,
              format: r.format,
              tags: r.tags,
              curatorial_note: r.curatorial_note,
              status,
              source: "cannes-lions",
            });
            if (error) {
              if ((error as { code?: string }).code === "23505") summary.skipped_duplicates++;
              else summary.errors++;
              continue;
            }
            if (status === "published") summary.auto_published++;
            else summary.sent_to_review++;
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
    headers: {
      ...corsHeaders,
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
});
