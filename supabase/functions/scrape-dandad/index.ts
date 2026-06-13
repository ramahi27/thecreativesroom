// D&AD scraper — targets dandad.org winners pages.
// Tries __NEXT_DATA__ JSON extraction first, falls back to HTML/meta parsing.
// Streams NDJSON progress. Inserts into references as published=false drafts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as cheerio from "https://esm.sh/cheerio@1.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASE = "https://www.dandad.org";
const WINNERS_URL = `${BASE}/en/d-ad-awards-pencil-winners/`;

// Browser-like headers to avoid Cloudflare blocks
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};
const PENCIL_LABELS: Record<string, string> = {
  "black": "Black Pencil",
  "yellow": "Yellow Pencil",
  "graphite": "Graphite Pencil",
  "wood": "Wood Pencil",
};

interface Body {
  years?: number[];           // e.g. [2022, 2023, 2024]
  awardLevels?: string[];     // black | yellow | graphite | wood
  disciplines?: string[];     // print | photography | outdoor | film | craft | design
}

interface Scraped {
  title: string;
  brand: string | null;
  agency: string | null;
  source_url: string;
  thumbnail_url: string | null;
  type: "image" | "video";
  year: number | null;
  award_level: string;
  discipline: string;
  tags: string[];
}

function upscale(url: string): string {
  return url.replace(/[?&](w|width)=\d+/gi, (m) => m.replace(/\d+/, "1200"));
}

function isVideoDisc(disc: string): boolean {
  return ["film", "craft", "animation", "moving image"].some((k) => disc.toLowerCase().includes(k));
}

/** Try to extract entries from __NEXT_DATA__ embedded JSON */
function extractFromNextData(html: string, year: number, awardWhitelist: Set<string>): Scraped[] {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return [];
  try {
    const data = JSON.parse(match[1]);
    // Walk the props tree looking for arrays that look like award entries
    const entries: Scraped[] = [];
    function walk(obj: unknown, depth = 0): void {
      if (depth > 10 || !obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) {
        for (const item of obj) {
          // Heuristic: an award entry has at least title + some image/url field
          if (item && typeof item === "object" && !Array.isArray(item)) {
            const k = item as Record<string, unknown>;
            const title = (k.title || k.entryTitle || k.name || k.campaignTitle || "") as string;
            const brand = (k.brand || k.client || k.advertiser || k.companyName || "") as string;
            const agency = (k.agency || k.agencyName || k.companyAgency || "") as string;
            const slug = (k.slug || k.url || k.permalink || "") as string;
            const img = (k.imageUrl || k.image || k.thumbnailUrl || k.thumbnail || k.coverImage || "") as string;
            const disc = (k.discipline || k.category || k.subCategory || "") as string;
            const award = (k.awardLevel || k.pencil || k.award || "") as string;

            if (title && title.length > 2 && (img || slug)) {
              const source_url = slug
                ? (slug.startsWith("http") ? slug : `${BASE}${slug.startsWith("/") ? "" : "/"}${slug}`)
                : "";
              const pencilKey = award.toLowerCase();
              const pencilLabel = PENCIL_LABELS[pencilKey] || award;
              if (awardWhitelist.size > 0 && award && !awardWhitelist.has(pencilKey)) {
                walk(obj, depth + 1);
                return;
              }
              entries.push({
                title: String(title).trim(),
                brand: String(brand).trim() || null,
                agency: String(agency).trim() || null,
                source_url,
                thumbnail_url: img ? (img.startsWith("http") ? upscale(img) : `https:${upscale(img)}`) : null,
                type: isVideoDisc(disc) ? "video" : "image",
                year,
                award_level: pencilLabel || "Pencil",
                discipline: String(disc).trim() || "Advertising",
                tags: ["d&ad", "pencil", (pencilLabel || "pencil").toLowerCase(), year.toString()],
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
    // Deduplicate
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

/** HTML fallback: parse entry cards from D&AD winners listing */
function extractFromHtml(html: string, year: number, pageUrl: string): Scraped[] {
  const $ = cheerio.load(html);
  const results: Scraped[] = [];

  $("[class*='EntryCard'], [class*='entry-card'], [class*='winner'], article").each((_i, el) => {
    const $el = $(el);
    const $a = $el.is("a") ? $el : $el.find("a").first();
    const href = $a.attr("href") || "";
    const source_url = href.startsWith("http") ? href : href ? `${BASE}${href}` : pageUrl;

    const title =
      $el.find("h2, h3, h4, [class*='title'], [class*='Title']").first().text().trim() ||
      $el.find("a").first().attr("title") || "";
    if (!title || title.length < 3) return;

    const img = $el.find("img").first();
    const raw_thumb = img.attr("src") || img.attr("data-src") || img.attr("data-lazy") || null;
    const thumbnail_url = raw_thumb
      ? (raw_thumb.startsWith("http") ? upscale(raw_thumb) : `https:${upscale(raw_thumb)}`)
      : null;

    const brand = $el.find("[class*='brand'], [class*='client'], [class*='advertiser']").first().text().trim() || null;
    const agency = $el.find("[class*='agency'], [class*='company']").first().text().trim() || null;
    const pencilEl = $el.find("[class*='pencil'], [class*='award'], [class*='level']").first().text().trim();
    const award_level = pencilEl || "Pencil";
    const disc = $el.find("[class*='discipline'], [class*='category']").first().text().trim() || "Advertising";

    results.push({
      title,
      brand,
      agency,
      source_url,
      thumbnail_url,
      type: isVideoDisc(disc) ? "video" : "image",
      year,
      award_level,
      discipline: disc,
      tags: ["d&ad", award_level.toLowerCase(), year.toString()],
    });
  });

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
  const currentYear = new Date().getFullYear();
  const years = body.years?.length ? body.years : [currentYear, currentYear - 1];
  const awardWhitelist = new Set<string>(
    body.awardLevels?.length ? body.awardLevels : []
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      const summary = { total_fetched: 0, saved: 0, skipped_duplicates: 0, skipped_no_image: 0, errors: 0 };

      try {
        // D&AD serves a single archive page; year filtering happens via __NEXT_DATA__ or HTML
        send({ type: "progress", message: `Fetching D&AD winners archive…`, url: WINNERS_URL });
        let archiveHtml = "";
        try {
          const resp = await fetch(WINNERS_URL, { headers: BROWSER_HEADERS });
          if (!resp.ok) {
            send({ type: "warn", message: `D&AD archive: HTTP ${resp.status}` });
            summary.errors++;
          } else {
            archiveHtml = await resp.text();
          }
        } catch (e) {
          send({ type: "warn", message: `D&AD archive: fetch failed — ${(e as Error).message}` });
          summary.errors++;
        }

        for (const year of years) {
          // Also try year-specific URL as some D&AD pages use category-year path
          const yearUrl = `${BASE}/awards/d-ad-awards/categories-${year}/`;
          let html = archiveHtml;

          if (!html) {
            send({ type: "progress", message: `Trying year URL for ${year}…`, url: yearUrl });
            try {
              const resp = await fetch(yearUrl, { headers: BROWSER_HEADERS });
              if (resp.ok) html = await resp.text();
            } catch { /* fall through */ }
          }

          if (!html) {
            send({ type: "warn", message: `D&AD ${year}: no content retrieved` });
            summary.errors++;
            continue;
          }

          send({ type: "progress", message: `Parsing D&AD ${year} entries…` });

          // Try __NEXT_DATA__ first, then HTML fallback
          let entries = extractFromNextData(html, year, awardWhitelist);
          if (entries.length === 0) {
            send({ type: "progress", message: `No __NEXT_DATA__ found for ${year}, trying HTML parse…` });
            entries = extractFromHtml(html, year, WINNERS_URL);
          }
          // Filter to requested year if entries have year metadata
          const yearEntries = entries.filter((e) => !e.year || e.year === year);

          send({ type: "progress", message: `✓ D&AD ${year} — ${yearEntries.length} entries found` });
          summary.total_fetched += yearEntries.length;
          // Replace loop body entries reference
          const filteredEntries = yearEntries;

          for (const r of filteredEntries) {
            if (!r.thumbnail_url) { summary.skipped_no_image++; continue; }
            if (!r.source_url) { summary.skipped_no_image++; continue; }

            const { data: existing } = await supabase
              .from("references").select("id").eq("source_url", r.source_url).maybeSingle();
            if (existing) { summary.skipped_duplicates++; continue; }

            const { error } = await supabase.from("references").insert({
              title: r.title,
              type: r.type,
              source_url: r.source_url,
              thumbnail_url: r.thumbnail_url,
              media_url: r.type === "image" ? r.thumbnail_url : null,
              media_items: [],
              brand: r.brand,
              agency: r.agency,
              year: r.year,
              categories: [],
              tags: r.tags,
              notes: `D&AD ${r.award_level} — ${r.discipline} (${year})`,
              created_by: user.id,
              published: false,
              source: "dandad",
            });
            if (error) {
              if ((error as any).code === "23505") summary.skipped_duplicates++;
              else { summary.errors++; send({ type: "warn", message: `Insert failed: ${error.message}` }); }
              continue;
            }
            summary.saved++;
          }

          await new Promise((r) => setTimeout(r, 1000));
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
