// Ads of the World scraper — uses RSS feed as primary source, falls back to HTML.
// Streams NDJSON progress. Inserts into references as published=false drafts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as cheerio from "https://esm.sh/cheerio@1.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASE = "https://www.adsoftheworld.com";

// RSS feeds are designed for machines — usually bypass Cloudflare JS challenge
const RSS_FEEDS: Record<string, string[]> = {
  print:   [`${BASE}/feed/?cat=print`, `${BASE}/media/print/feed`, `${BASE}/rss.xml?category=print`],
  outdoor: [`${BASE}/feed/?cat=outdoor`, `${BASE}/media/outdoor/feed`],
  film:    [`${BASE}/feed/?cat=film`, `${BASE}/media/film/feed`],
  digital: [`${BASE}/feed/?cat=digital`, `${BASE}/media/digital/feed`],
};

const HTML_URLS: Record<string, string> = {
  print:   `${BASE}/media/print`,
  outdoor: `${BASE}/media/outdoor`,
  film:    `${BASE}/media/film`,
  digital: `${BASE}/media/digital`,
};

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

interface Body {
  mediums?: string[];  // print | outdoor | film | digital
  pages?: number;      // how many listing pages per medium (default 2)
}

interface Scraped {
  title: string;
  brand: string | null;
  agency: string | null;
  source_url: string;
  thumbnail_url: string | null;
  type: "image" | "video";
  year: number | null;
  tags: string[];
  medium: string;
}

function upscale(url: string): string {
  return url.replace(/[?&](w|width)=\d+/gi, (m) => m.replace(/\d+/, "1200"));
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

/** Extract thumbnail URL from RSS item raw XML string */
function extractRssThumb(itemXml: string): string | null {
  // media:content url="..."
  const m1 = itemXml.match(/media:content[^>]+url="([^"]+)"/i);
  if (m1) return m1[1];
  // enclosure url="..."
  const m2 = itemXml.match(/enclosure[^>]+url="([^"]+)"/i);
  if (m2) return m2[1];
  // img inside description/content
  const m3 = itemXml.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m3) return m3[1];
  return null;
}

/** Parse RSS/Atom XML */
function parseRss(xml: string, medium: string): Scraped[] {
  if (isCloudflareChallenge(xml)) return [];

  const $ = cheerio.load(xml, { xmlMode: true });
  const results: Scraped[] = [];

  $("item").each((_i, el) => {
    const raw = (el as unknown as { toString(): string }).toString?.() || $.xml($(el));
    const title = $(el).find("title").first().text().replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const link = $(el).find("link").first().text().trim()
      || $(el).find("guid").first().text().trim();
    const creator = $(el).find("dc\\:creator, creator").first().text()
      .replace(/<!\[CDATA\[|\]\]>/g, "").trim();

    if (!title || title.length < 3 || !link) return;

    const rawThumb = extractRssThumb(raw);
    const thumbnail_url = rawThumb
      ? (rawThumb.startsWith("http") ? upscale(rawThumb) : `https:${upscale(rawThumb)}`)
      : null;

    results.push({
      title,
      brand: null,
      agency: creator || null,
      source_url: link.startsWith("http") ? link : `${BASE}${link}`,
      thumbnail_url,
      type: medium === "film" ? "video" : "image",
      year: null,
      tags: ["ads of the world", medium],
      medium,
    });
  });

  return results;
}

/** HTML fallback: try multiple selectors */
function parseHtml(html: string, medium: string): Scraped[] {
  if (isCloudflareChallenge(html)) return [];

  const $ = cheerio.load(html);
  const results: Scraped[] = [];

  // Broad selector set for different Drupal/custom layouts
  const cards = $(
    "article, .views-row, [class*='node--type'], [class*='card'], .ad-item, " +
    "[class*='campaign'], [class*='Campaign'], [class*='work-item'], li.item"
  ).filter((_i, el) => $(el).find("a, img").length > 0);

  cards.each((_i, el) => {
    const $el = $(el);
    const href =
      $el.find("a").first().attr("href") || $el.closest("a").attr("href") || "";
    if (!href) return;
    const source_url = href.startsWith("http") ? href : `${BASE}${href}`;

    const title =
      $el.find("h2, h3, h4, [class*='title']").first().text().trim() ||
      $el.find("a").first().attr("title") || "";
    if (!title || title.length < 3) return;

    const img = $el.find("img").first();
    const raw_thumb =
      img.attr("src") || img.attr("data-src") || img.attr("data-lazy-src") || null;
    const thumbnail_url = raw_thumb
      ? (raw_thumb.startsWith("http") ? upscale(raw_thumb) : `https:${upscale(raw_thumb)}`)
      : null;

    const brand = $el.find("[class*='brand'], [class*='client'], [class*='advertiser']").first().text().trim();
    const agency = $el.find("[class*='agency'], [class*='credits']").first().text().trim();

    results.push({
      title,
      brand: brand || null,
      agency: agency || null,
      source_url,
      thumbnail_url,
      type: medium === "film" ? "video" : "image",
      year: null,
      tags: ["ads of the world", medium],
      medium,
    });
  });

  // Fallback: any linked titles with ad-like href patterns
  if (results.length === 0) {
    $("a[href*='/work/'], a[href*='/ad/'], a[href*='/campaign/'], a[href*='/campaigns/']").each((_i, el) => {
      const $a = $(el);
      const href = $a.attr("href") || "";
      const source_url = href.startsWith("http") ? href : `${BASE}${href}`;
      const title = $a.text().trim() || $a.attr("title") || "";
      if (!title || title.length < 3) return;
      const raw_thumb = $a.find("img").first().attr("src") || null;
      results.push({
        title,
        brand: null,
        agency: null,
        source_url,
        thumbnail_url: raw_thumb ? upscale(raw_thumb) : null,
        type: medium === "film" ? "video" : "image",
        year: null,
        tags: ["ads of the world", medium],
        medium,
      });
    });
  }

  const seen = new Set<string>();
  return results.filter((r) => {
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
  const mediums = body.mediums?.length ? body.mediums : ["print", "outdoor"];
  const pages = Math.min(body.pages ?? 2, 5);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      const summary = { total_fetched: 0, saved: 0, skipped_duplicates: 0, skipped_no_image: 0, errors: 0 };

      try {
        for (const medium of mediums) {
          // Try RSS feeds first (bypass Cloudflare JS challenge)
          const rssUrls = RSS_FEEDS[medium] || [];
          let rssEntries: Scraped[] = [];
          let rssSource = "";

          for (const rssUrl of rssUrls) {
            send({ type: "progress", message: `Trying RSS for ${medium}…`, url: rssUrl });
            try {
              const resp = await fetch(rssUrl, { headers: BROWSER_HEADERS });
              if (resp.ok) {
                const xml = await resp.text();
                const parsed = parseRss(xml, medium);
                if (parsed.length > 0) {
                  rssEntries = parsed;
                  rssSource = rssUrl;
                  break;
                }
                send({ type: "progress", message: `RSS at ${rssUrl} returned 0 items, trying next…` });
              }
            } catch (_e) { /* try next */ }
          }

          if (rssEntries.length > 0) {
            send({ type: "progress", message: `✓ RSS ${medium} (${rssSource}) — ${rssEntries.length} entries` });
            summary.total_fetched += rssEntries.length;

            for (const r of rssEntries) {
              if (!r.thumbnail_url) { summary.skipped_no_image++; continue; }
              const { data: existing } = await supabase
                .from("references").select("id").eq("source_url", r.source_url).maybeSingle();
              if (existing) { summary.skipped_duplicates++; continue; }
              const { error } = await supabase.from("references").insert({
                title: r.title, type: r.type, source_url: r.source_url,
                thumbnail_url: r.thumbnail_url,
                media_url: r.type === "image" ? r.thumbnail_url : null,
                media_items: [], brand: r.brand, agency: r.agency, year: r.year,
                categories: [], tags: r.tags,
                notes: `Ads of the World — ${r.medium}`,
                created_by: user.id, published: false, source: "adsoftheworld",
              });
              if (error) {
                if ((error as any).code === "23505") summary.skipped_duplicates++;
                else { summary.errors++; send({ type: "warn", message: `Insert failed: ${error.message}` }); }
                continue;
              }
              summary.saved++;
            }
            continue; // RSS worked, skip HTML scraping for this medium
          }

          // RSS failed — fall back to HTML listing pages
          send({ type: "progress", message: `RSS unavailable for ${medium}, trying HTML pages…` });
          const baseUrl = HTML_URLS[medium];
          if (!baseUrl) { send({ type: "warn", message: `Unknown medium: ${medium}` }); continue; }

          for (let p = 0; p < pages; p++) {
            const pageUrl = p === 0 ? baseUrl : `${baseUrl}?page=${p}`;
            send({ type: "progress", message: `Fetching ${medium} page ${p + 1}…` });

            let html = "";
            try {
              const resp = await fetch(pageUrl, { headers: BROWSER_HEADERS });
              if (!resp.ok) {
                send({ type: "warn", message: `${medium} p${p + 1}: HTTP ${resp.status}` });
                summary.errors++;
                break;
              }
              html = await resp.text();
            } catch (e) {
              send({ type: "warn", message: `${medium} p${p + 1}: fetch failed — ${(e as Error).message}` });
              summary.errors++;
              break;
            }

            if (isCloudflareChallenge(html)) {
              send({ type: "warn", message: `${medium} p${p + 1}: blocked by Cloudflare bot protection` });
              summary.errors++;
              break;
            }

            const entries = parseHtml(html, medium);
            send({ type: "progress", message: `✓ ${medium} p${p + 1} — ${entries.length} entries found` });
            summary.total_fetched += entries.length;

            for (const r of entries) {
              if (!r.thumbnail_url) { summary.skipped_no_image++; continue; }
              const { data: existing } = await supabase
                .from("references").select("id").eq("source_url", r.source_url).maybeSingle();
              if (existing) { summary.skipped_duplicates++; continue; }
              const { error } = await supabase.from("references").insert({
                title: r.title, type: r.type, source_url: r.source_url,
                thumbnail_url: r.thumbnail_url,
                media_url: r.type === "image" ? r.thumbnail_url : null,
                media_items: [], brand: r.brand, agency: r.agency, year: r.year,
                categories: [], tags: r.tags,
                notes: `Ads of the World — ${r.medium}`,
                created_by: user.id, published: false, source: "adsoftheworld",
              });
              if (error) {
                if ((error as any).code === "23505") summary.skipped_duplicates++;
                else { summary.errors++; send({ type: "warn", message: `Insert failed: ${error.message}` }); }
                continue;
              }
              summary.saved++;
            }

            await new Promise((r) => setTimeout(r, 800));
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
