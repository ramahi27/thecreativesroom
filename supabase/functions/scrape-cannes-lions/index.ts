// Cannes Lions scraper (lovethework.com) — direct fetch + cheerio parse.
// Streams progress via NDJSON. Standalone: only writes to public.pending_refs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as cheerio from "https://esm.sh/cheerio@1.0.0";

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
  categories?: string[];  // film | print | photography | outdoor
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

function buildStartUrls(categories: string[]): { url: string; label: string }[] {
  const map: Record<string, { url: string; label: string }[]> = {
    film: [
      { url: "https://www.lovethework.com/en/awards/winners-shortlists/cannes-lions/film", label: "Film" },
      { url: "https://www.lovethework.com/en/awards/winners-shortlists/cannes-lions/film-craft", label: "Film Craft" },
    ],
    print: [{ url: "https://www.lovethework.com/en/awards/winners-shortlists/cannes-lions/print-publishing", label: "Print & Publishing" }],
    outdoor: [{ url: "https://www.lovethework.com/en/awards/winners-shortlists/cannes-lions/outdoor", label: "Outdoor" }],
    photography: [{ url: "https://www.lovethework.com/en/awards/winners-shortlists/cannes-lions/photography", label: "Photography" }],
  };
  const out: { url: string; label: string }[] = [];
  for (const c of categories) if (map[c]) out.push(...map[c]);
  return out;
}

function categoryFromUrl(url: string): string {
  if (url.includes("film-craft")) return "Film Craft";
  if (url.includes("film")) return "Film";
  if (url.includes("print")) return "Print & Publishing";
  if (url.includes("outdoor")) return "Outdoor";
  if (url.includes("photography")) return "Photography";
  return "Film";
}

function parsePage(html: string, requestUrl: string): Scraped[] {
  const $ = cheerio.load(html);
  const results: Scraped[] = [];
  const urlCategory = categoryFromUrl(requestUrl);
  const format: "video" | "photo" = urlCategory.includes("Film") ? "video" : "photo";

  $("h3, h2").each((_i, el) => {
    const $el = $(el);
    const $card = $el.closest('a, [class*="card"], [class*="Card"], article, section > div');
    const containerText = ($card.length ? $card.text() : $el.parent().text()).toLowerCase();

    const awardLevel = containerText.includes("grand prix")
      ? "Grand Prix"
      : containerText.includes("gold cannes")
      ? "Gold Lion"
      : null;
    if (!awardLevel) return;

    const title = $el.text().trim();
    if (!title || title.length < 2) return;

    const metaText =
      $el.next().text().trim() ||
      ($card.length ? $card.find('p, [class*="meta"], [class*="brand"], [class*="client"]').first().text().trim() : "");
    const [brandRaw, agencyRaw] = metaText.split(",");
    const brand = (brandRaw || "").trim();
    const agency = (agencyRaw || "").trim();

    const $imgScope = $card.length ? $card : $el.closest("div");
    const imgSrc =
      $imgScope.find("img").first().attr("src") ||
      $imgScope.find("img").first().attr("data-src") ||
      null;

    const href =
      ($card.is("a") ? $card.attr("href") : "") ||
      $card.find("a").first().attr("href") ||
      $el.closest("a").attr("href") ||
      "";
    const sourceUrl = href.startsWith("http")
      ? href
      : href
      ? `https://www.lovethework.com${href}`
      : "";

    results.push({
      title,
      brand,
      agency,
      category: urlCategory,
      award_level: awardLevel,
      image_url: imgSrc,
      source_url: sourceUrl,
      year: null,
      format,
      tags: ["cannes lions", awardLevel.toLowerCase(), urlCategory.toLowerCase()],
      curatorial_note: `Cannes Lions ${awardLevel} — ${urlCategory}`,
    });
  });

  const seen = new Set<string>();
  return results.filter((r) => {
    if (!r.source_url) return true;
    if (seen.has(r.source_url)) return false;
    seen.add(r.source_url);
    return true;
  });
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
  const yearFrom = body.yearFrom ?? 2010;
  const yearTo = body.yearTo ?? 2025;
  const awards = body.awardLevels && body.awardLevels.length ? body.awardLevels : ["grand-prix", "gold"];
  const categories = body.categories && body.categories.length ? body.categories : ["film", "print", "photography", "outdoor"];
  const autoApprove = body.autoApproveGrandPrix ?? true;

  const awardWhitelist = new Set(
    awards.map((a) => (a === "grand-prix" ? "Grand Prix" : "Gold Lion")),
  );

  const startUrls = buildStartUrls(categories);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      const summary = {
        total_fetched: 0,
        auto_published: 0,
        sent_to_review: 0,
        skipped_duplicates: 0,
        skipped_no_image: 0,
        skipped_invalid: 0,
        skipped_out_of_year: 0,
        errors: 0,
      };

      try {
        for (const { url, label } of startUrls) {
          send({ type: "progress", message: `Fetching ${label} winners...`, url });

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

          const rawResults = parsePage(html, url);
          const rawCount = rawResults.length;

          let results = rawResults.filter((r) => awardWhitelist.has(r.award_level));

          results = results.filter((r) => {
            if (r.year == null) return true;
            if (r.year < yearFrom || r.year > yearTo) {
              summary.skipped_out_of_year++;
              return false;
            }
            return true;
          });

          send({
            type: "progress",
            message: `✓ ${label} page scraped — ${rawCount} raw entries found, ${results.length} passed filters`,
          });

          summary.total_fetched += results.length;

          for (const r of results) {
            if (!r.image_url) { summary.skipped_no_image++; continue; }
            if (!r.title) { summary.skipped_invalid++; continue; }

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
