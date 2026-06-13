// The One Club / ADC scraper — targets oneclub.org winners pages.
// Tries __NEXT_DATA__ JSON extraction first, falls back to HTML/meta parsing.
// Streams NDJSON progress. Inserts into references as published=false drafts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as cheerio from "https://esm.sh/cheerio@1.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASE = "https://www.oneclub.org";

// URL patterns for One Club award archives — try each in order until one works.
const AWARD_URL_PATTERNS: Record<string, string[]> = {
  "one-show": [
    `${BASE}/awards/theoneshow/-archive/awards/{year}/all/all/select`,
    `${BASE}/awards/theoneshow/-archive/awards/{year}/`,
    `${BASE}/awards/theoneshow/?year={year}`,
  ],
  "adc": [
    `${BASE}/awards/adcawards/-archive/awards/{year}/all/all/select`,
    `${BASE}/awards/adcawards/-archive/awards/{year}/`,
  ],
  "young-ones": [
    `${BASE}/awards/youngones/-archive/awards/{year}/all/all/select`,
    `${BASE}/awards/youngones/-archive/awards/{year}/`,
  ],
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
  years?: number[];
  awards?: string[];      // one-show | adc | young-ones
  disciplines?: string[]; // print | outdoor | film | design | interactive
}

interface Scraped {
  title: string;
  brand: string | null;
  agency: string | null;
  source_url: string;
  thumbnail_url: string | null;
  type: "image" | "video";
  year: number | null;
  award: string;
  discipline: string;
  tags: string[];
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

function isVideoDisc(disc: string): boolean {
  return ["film", "tv", "video", "moving", "broadcast", "animation"].some((k) =>
    disc.toLowerCase().includes(k)
  );
}

/** Extract from __NEXT_DATA__ JSON embedded by Next.js */
function extractFromNextData(html: string, year: number, awardLabel: string): Scraped[] {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return [];
  try {
    const data = JSON.parse(match[1]);
    const entries: Scraped[] = [];
    function walk(obj: unknown, depth = 0): void {
      if (depth > 10 || !obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) {
        for (const item of obj) {
          if (item && typeof item === "object" && !Array.isArray(item)) {
            const k = item as Record<string, unknown>;
            const title = (k.title || k.entryTitle || k.name || k.projectTitle || "") as string;
            const brand = (k.brand || k.client || k.advertiser || k.entrant || "") as string;
            const agency = (k.agency || k.agencyName || k.studio || "") as string;
            const slug = (k.slug || k.url || k.permalink || k.entryUrl || "") as string;
            const img = (k.imageUrl || k.image || k.thumbnailUrl || k.thumbnail || k.heroImage || "") as string;
            const disc = (k.discipline || k.category || k.medium || k.craft || "") as string;

            if (title && title.length > 2 && (img || slug)) {
              const source_url = slug
                ? (slug.startsWith("http") ? slug : `${BASE}${slug.startsWith("/") ? "" : "/"}${slug}`)
                : "";
              entries.push({
                title: String(title).trim(),
                brand: String(brand).trim() || null,
                agency: String(agency).trim() || null,
                source_url,
                thumbnail_url: img
                  ? (img.startsWith("http") ? upscale(img) : `https:${upscale(img)}`)
                  : null,
                type: isVideoDisc(disc) ? "video" : "image",
                year,
                award: awardLabel,
                discipline: String(disc).trim() || "Advertising",
                tags: ["the one club", awardLabel.toLowerCase(), year.toString()],
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

/** HTML fallback parse */
function extractFromHtml(html: string, year: number, awardLabel: string, pageUrl: string): Scraped[] {
  const $ = cheerio.load(html);
  const results: Scraped[] = [];

  $("[class*='entry'], [class*='winner'], [class*='card'], article").each((_i, el) => {
    const $el = $(el);
    const $a = $el.is("a") ? $el : $el.find("a").first();
    const href = $a.attr("href") || "";
    const source_url = href.startsWith("http") ? href : href ? `${BASE}${href}` : pageUrl;

    const title =
      $el.find("h2, h3, h4, [class*='title']").first().text().trim() ||
      $a.attr("title") || "";
    if (!title || title.length < 3) return;

    const img = $el.find("img").first();
    const raw_thumb = img.attr("src") || img.attr("data-src") || null;
    const thumbnail_url = raw_thumb
      ? (raw_thumb.startsWith("http") ? upscale(raw_thumb) : `https:${upscale(raw_thumb)}`)
      : null;

    const brand = $el.find("[class*='client'], [class*='brand'], [class*='advertiser']").first().text().trim() || null;
    const agency = $el.find("[class*='agency'], [class*='studio']").first().text().trim() || null;
    const disc = $el.find("[class*='discipline'], [class*='category'], [class*='medium']").first().text().trim() || "Advertising";

    results.push({
      title,
      brand,
      agency,
      source_url,
      thumbnail_url,
      type: isVideoDisc(disc) ? "video" : "image",
      year,
      award: awardLabel,
      discipline: disc,
      tags: ["the one club", awardLabel.toLowerCase(), year.toString()],
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
  const awards = body.awards?.length ? body.awards : ["one-show", "adc"];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      const summary = { total_fetched: 0, saved: 0, skipped_duplicates: 0, skipped_no_image: 0, errors: 0 };

      try {
        for (const awardKey of awards) {
          const urlPatterns = AWARD_URL_PATTERNS[awardKey];
          if (!urlPatterns) { send({ type: "warn", message: `Unknown award: ${awardKey}` }); continue; }
          const awardLabel = awardKey === "adc" ? "ADC Annual Awards" : awardKey === "young-ones" ? "Young Ones" : "One Show";

          for (const year of years) {
            const allEntries: Scraped[] = [];

            // Try each URL pattern until one returns real content
            let foundEntries = false;
            for (const urlCandidate of urlPatterns) {
              const pageUrl = urlCandidate.replace("{year}", String(year));
              send({ type: "progress", message: `Trying ${awardLabel} ${year}…`, url: pageUrl });

              let html = "";
              try {
                const resp = await fetch(pageUrl, { headers: BROWSER_HEADERS });
                if (!resp.ok) {
                  send({ type: "progress", message: `${awardLabel} ${year}: HTTP ${resp.status} at ${pageUrl}, trying next…` });
                  continue;
                }
                html = await resp.text();
              } catch (e) {
                send({ type: "progress", message: `${awardLabel} ${year}: fetch error, trying next…` });
                continue;
              }

              if (isCloudflareChallenge(html)) {
                send({ type: "progress", message: `${awardLabel} ${year}: blocked by Cloudflare at ${pageUrl}, trying next…` });
                continue;
              }

              let entries = extractFromNextData(html, year, awardLabel);
              if (entries.length === 0) {
                entries = extractFromHtml(html, year, awardLabel, pageUrl);
              }
              allEntries.push(...entries);
              send({ type: "progress", message: `✓ ${awardLabel} ${year} — ${entries.length} entries via ${pageUrl}` });
              foundEntries = true;
              break; // found a working URL, stop trying alternatives
            }

            if (!foundEntries) {
              send({ type: "warn", message: `${awardLabel} ${year}: all URL patterns failed` });
              summary.errors++;
            }

            // Deduplicate across pages
            const seen = new Set<string>();
            const entries = allEntries.filter((e) => {
              const k = e.source_url || e.title;
              if (seen.has(k)) return false;
              seen.add(k); return true;
            });

            send({ type: "progress", message: `✓ ${awardLabel} ${year} — ${entries.length} entries found` });
            summary.total_fetched += entries.length;

            for (const r of entries) {
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
                notes: `${r.award} — ${r.discipline} (${year})`,
                created_by: user.id,
                published: false,
                source: "oneclub",
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
