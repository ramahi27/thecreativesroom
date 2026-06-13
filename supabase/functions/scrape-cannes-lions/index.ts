// Cannes Lions scraper (lovethework.com) — __NEXT_DATA__ extraction + HTML parse.
// Streams progress via NDJSON. Writes to public.pending_refs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as cheerio from "https://esm.sh/cheerio@1.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

interface Body {
  yearFrom?: number;
  yearTo?: number;
  awardLevels?: string[]; // "grand-prix" | "gold" | "silver" | "bronze"
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

function isCloudflareChallenge(html: string): boolean {
  return (
    html.includes("Just a moment") ||
    html.includes("cf-challenge") ||
    html.includes("Checking your browser") ||
    html.includes("DDoS protection by Cloudflare") ||
    (html.length < 10000 && html.includes("cloudflare"))
  );
}

async function fetchRendered(
  url: string,
  firecrawlKey: string,
): Promise<{ html: string; via: string } | null> {
  if (firecrawlKey) {
    try {
      const r = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { "Authorization": `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["html"], waitFor: 2000, timeout: 30000 }),
        signal: AbortSignal.timeout(40000),
      });
      if (r.ok) {
        const j = await r.json();
        if (j?.success && j?.data?.html) return { html: j.data.html, via: "Firecrawl" };
      }
    } catch { /* fall through */ }
  }
  try {
    const r = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(20000) });
    if (r.ok) {
      const html = await r.text();
      if (!isCloudflareChallenge(html)) return { html, via: "direct" };
    }
  } catch { /* fall through */ }
  return null;
}

function upscale(url: string): string {
  return url.replace(/[?&](w|width)=\d+/gi, (m) => m.replace(/\d+/, "1200"));
}

function detectAwardLevel(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("grand prix")) return "Grand Prix";
  if (t.includes("gold")) return "Gold Lion";
  if (t.includes("silver")) return "Silver Lion";
  if (t.includes("bronze")) return "Bronze Lion";
  if (t.includes("shortlist")) return "Shortlisted";
  return "Winner";
}

/** Extract from __NEXT_DATA__ JSON embedded by Next.js */
function extractFromNextData(html: string, urlCategory: string): Scraped[] {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return [];
  try {
    const data = JSON.parse(match[1]);
    const format: "video" | "photo" = urlCategory.includes("Film") ? "video" : "photo";
    const entries: Scraped[] = [];

    function walk(obj: unknown, depth = 0): void {
      if (depth > 12 || !obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) {
        for (const item of obj) {
          if (item && typeof item === "object" && !Array.isArray(item)) {
            const k = item as Record<string, unknown>;
            const title = (k.title || k.entryTitle || k.name || k.projectTitle || k.workTitle || "") as string;
            const brand = (k.brand || k.client || k.advertiser || k.brandName || "") as string;
            const agency = (k.agency || k.agencyName || k.company || "") as string;
            const slug = (k.slug || k.url || k.permalink || k.path || k.entryUrl || "") as string;
            const img = (k.imageUrl || k.image || k.thumbnailUrl || k.thumbnail || k.heroImage || k.coverImage || k.posterUrl || "") as string;
            const award = (k.award || k.awardLevel || k.lionType || k.medalType || k.tier || "") as string;

            if (title && title.length > 2 && (img || slug)) {
              const source_url = slug
                ? (slug.startsWith("http") ? slug : `https://www.lovethework.com${slug.startsWith("/") ? "" : "/"}${slug}`)
                : "";
              entries.push({
                title: String(title).trim(),
                brand: String(brand).trim(),
                agency: String(agency).trim(),
                category: urlCategory,
                award_level: award ? detectAwardLevel(String(award)) : "Winner",
                image_url: img ? (img.startsWith("http") ? upscale(img) : `https:${upscale(img)}`) : null,
                source_url,
                year: null,
                format,
                tags: ["cannes lions", urlCategory.toLowerCase()],
                curatorial_note: `Cannes Lions — ${urlCategory}`,
              });
            }
          }
          walk(item, depth + 1);
        }
      } else {
        for (const v of Object.values(obj as object)) walk(v, depth + 1);
      }
    }
    walk(data);
    const seen = new Set<string>();
    return entries.filter((e) => {
      const key = e.source_url || e.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return [];
  }
}

/** HTML fallback — permissive: grab anything with a title + card structure */
function parsePage(html: string, requestUrl: string): Scraped[] {
  if (isCloudflareChallenge(html)) return [];

  const $ = cheerio.load(html);
  const results: Scraped[] = [];
  const urlCategory = categoryFromUrl(requestUrl);
  const format: "video" | "photo" = urlCategory.includes("Film") ? "video" : "photo";

  // Broad selector — accept any card-like element
  const cardSel = [
    '[class*="card"]', '[class*="Card"]',
    '[class*="entry"]', '[class*="Entry"]',
    '[class*="work"]', '[class*="Work"]',
    '[class*="campaign"]', '[class*="Campaign"]',
    'article', 'li[class]',
  ].join(", ");

  $(cardSel).each((_i, el) => {
    const $el = $(el);
    // Skip nested cards
    if ($el.parents(cardSel).length > 0) return;

    const title = $el
      .find("h2, h3, h4, [class*='title'], [class*='Title'], [class*='name'], [class*='Name']")
      .first().text().trim();
    if (!title || title.length < 3) return;

    const $a = $el.is("a") ? $el : $el.find("a").first();
    const href = $a.attr("href") || "";
    const source_url = href.startsWith("http")
      ? href
      : href
      ? `https://www.lovethework.com${href}`
      : "";

    const img = $el.find("img").first();
    const image_url =
      img.attr("src") || img.attr("data-src") || img.attr("data-lazy-src") || null;

    const containerText = $el.text();
    const award_level = detectAwardLevel(containerText);

    const metaText = $el
      .find("p, [class*='meta'], [class*='brand'], [class*='client'], [class*='agency']")
      .first().text().trim();
    const parts = metaText.split(",");

    results.push({
      title,
      brand: parts[0]?.trim() || "",
      agency: parts[1]?.trim() || "",
      category: urlCategory,
      award_level,
      image_url: image_url
        ? image_url.startsWith("http")
          ? upscale(image_url)
          : `https:${upscale(image_url)}`
        : null,
      source_url,
      year: null,
      format,
      tags: ["cannes lions", award_level.toLowerCase(), urlCategory.toLowerCase()],
      curatorial_note: `Cannes Lions ${award_level} — ${urlCategory}`,
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
    awards.map((a) => (a === "grand-prix" ? "Grand Prix" : a === "gold" ? "Gold Lion" : a)),
  );

  const startUrls = buildStartUrls(categories);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      const summary = {
        total_fetched: 0, auto_published: 0, sent_to_review: 0,
        skipped_duplicates: 0, skipped_no_image: 0, skipped_invalid: 0,
        skipped_out_of_year: 0, errors: 0,
      };

      const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") ?? "";
      if (!firecrawlKey) send({ type: "warn", message: "FIRECRAWL_API_KEY not set — falling back to direct fetch (may be blocked by Cloudflare)" });

      try {
        for (const { url, label } of startUrls) {
          send({ type: "progress", message: `Fetching ${label} winners${firecrawlKey ? " via Firecrawl" : ""}...`, url });

          const result = await fetchRendered(url, firecrawlKey);
          if (!result) {
            summary.errors++;
            send({ type: "warn", message: `${label}: failed to load${firecrawlKey ? "" : " — set FIRECRAWL_API_KEY to bypass Cloudflare"}` });
            continue;
          }
          const html = result.html;

          const urlCategory = categoryFromUrl(url);

          let rawResults = extractFromNextData(html, urlCategory);
          const strategy = rawResults.length > 0 ? `__NEXT_DATA__ (${result.via})` : `HTML parse (${result.via})`;

          if (rawResults.length === 0) {
            rawResults = parsePage(html, url);
          }

          const rawCount = rawResults.length;

          // Apply award level filter (only if specific levels requested)
          let results = awardWhitelist.size > 0
            ? rawResults.filter((r) => awardWhitelist.has(r.award_level))
            : rawResults;

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
            message: `✓ ${label} (via ${strategy}) — ${rawCount} raw, ${results.length} passed filters`,
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
    headers: { ...corsHeaders, "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
  });
});
