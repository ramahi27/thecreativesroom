// Scrape a YouTube / Vimeo / generic web page link, infer metadata via Lovable AI,
// and insert as a draft reference. Admin-only (verified server-side).
// YouTube playlists expand into one draft per video.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Scraped {
  title: string;
  source_url: string;
  thumbnail_url: string | null;
  type: "video" | "image" | "link";
  brand_guess?: string;
  agency_guess?: string | null;
  year_guess?: number | null;
  images?: string[];
  body_text?: string;
  image_warning?: boolean;
}

function ytId(u: URL): string | null {
  if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
  if (u.hostname.includes("youtube.com")) {
    if (u.pathname.startsWith("/watch")) return u.searchParams.get("v");
    if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
    if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || null;
  }
  return null;
}

function ytPlaylistId(u: URL): string | null {
  if (!u.hostname.includes("youtube.com")) return null;
  const list = u.searchParams.get("list");
  return list && /^[A-Za-z0-9_-]+$/.test(list) ? list : null;
}

/** Fetch all video IDs from a YouTube playlist by scraping the playlist page HTML. */
async function fetchPlaylistVideoIds(playlistId: string): Promise<string[]> {
  const url = `https://www.youtube.com/playlist?list=${playlistId}`;
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  const html = await r.text();
  const ids = new Set<string>();
  // Match all "videoId":"XXXXXXXXXXX" occurrences
  const re = /"videoId":"([A-Za-z0-9_-]{11})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) ids.add(m[1]);
  return [...ids];
}

async function scrapeYouTube(url: string, id: string): Promise<Scraped> {
  let title = "YouTube video";
  let author = "";
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
    );
    if (r.ok) {
      const d = await r.json();
      title = d.title || title;
      author = d.author_name || "";
    }
  } catch {/* ignore */}
  return {
    title,
    source_url: `https://www.youtube.com/watch?v=${id}`,
    thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    type: "video",
    brand_guess: author,
  };
}

async function scrapeVimeo(url: string): Promise<Scraped> {
  let title = "Vimeo video";
  let thumb: string | null = null;
  let author = "";
  try {
    const r = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
    if (r.ok) {
      const d = await r.json();
      title = d.title || title;
      thumb = d.thumbnail_url || null;
      author = d.author_name || "";
    }
  } catch {/* ignore */}
  return { title, source_url: url, thumbnail_url: thumb, type: "video", brand_guess: author };
}

function pickMeta(html: string, names: string[]): string | null {
  for (const n of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${n}["'][^>]+content=["']([^"']+)["']`,
      "i",
    );
    const m = html.match(re);
    if (m) return m[1];
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${n}["']`,
      "i",
    );
    const m2 = html.match(re2);
    if (m2) return m2[1];
  }
  return null;
}

// SSRF guard: block private/loopback/link-local/metadata destinations.
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal")) return true;
  // IPv6 loopback / link-local / unique-local
  if (h === "::1" || h === "[::1]") return true;
  if (h.startsWith("[fc") || h.startsWith("[fd") || h.startsWith("[fe80")) return true;
  // IPv4 dotted
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [parseInt(m[1]), parseInt(m[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + AWS metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast/reserved
  }
  return false;
}

async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  const u = new URL(url);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Invalid protocol");
  if (isBlockedHost(u.hostname)) throw new Error("Blocked host");
  return await fetch(url, { ...init, redirect: "manual" });
}

/**
 * Fetch a page's rendered HTML. Tries Firecrawl first (headless Chrome — executes
 * JavaScript and bypasses Cloudflare, so campaign sites like Ads of the World work),
 * then falls back to a direct SSRF-guarded fetch. Returns the full rendered DOM.
 */
async function fetchPageHtml(url: string): Promise<{ html: string; via: string }> {
  const fcKey = Deno.env.get("FIRECRAWL_API_KEY") ?? "";
  if (fcKey) {
    try {
      const r = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${fcKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          formats: ["rawHtml"],   // full rendered DOM — we want every campaign image
          onlyMainContent: false,
          waitFor: 2500,
          timeout: 30000,
        }),
        signal: AbortSignal.timeout(45000),
      });
      if (r.ok) {
        const j = await r.json();
        const html = j?.data?.rawHtml || j?.data?.html;
        if (j?.success && html) return { html, via: "firecrawl" };
      }
    } catch { /* fall through to direct */ }
  }
  // Direct fallback (SSRF-guarded, no redirect following)
  const resp = await safeFetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; CreativesRoomBot/1.0; +https://thecreativesroom.com)",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (resp.status >= 300 && resp.status < 400) throw new Error("Redirects not allowed");
  return { html: await resp.text(), via: "direct" };
}

/* ─────────────────────────── Article body isolation ─────────────────────── */

const ARTICLE_PATTERNS: RegExp[] = [
  /<article\b[^>]*>([\s\S]*?)<\/article>/i,
  /<main\b[^>]*>([\s\S]*?)<\/main>/i,
  /<[^>]+\brole=["']main["'][^>]*>([\s\S]*?)<\/[a-z]+>/i,
  /<div[^>]*\bclass=["'][^"']*\b(?:post-content|article-body|entry-content|campaign-detail|work-detail|case-study|entry)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
];

function extractArticleBody(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  for (const re of ARTICLE_PATTERNS) {
    const m = stripped.match(re);
    if (m && m[1] && m[1].length > 200) return m[1];
  }
  return stripped;
}

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/* ─────────────────────────────── Helpers ────────────────────────────────── */

const BAD_IMG_RE =
  /logo|icon|avatar|author|profile|badge|thumb|widget|sidebar|\bads?\b|banner|placeholder|blank|pixel|sprite|spinner|emoji|favicon/i;

function normalizeUrl(raw: string | null | undefined, baseUrl: string): string | null {
  if (!raw) return null;
  let u = raw.trim();
  if (!u || u.startsWith("data:")) return null;
  if (u.startsWith("//")) u = "https:" + u;
  if (!/^https?:\/\//i.test(u)) {
    try { u = new URL(u, baseUrl).toString(); } catch { return null; }
  }
  return u;
}

function isAcceptableImageUrl(u: string): boolean {
  if (/\.(svg|gif)(\?|$)/i.test(u)) return false;
  if (BAD_IMG_RE.test(u)) return false;
  return true;
}

/** Famouscampaigns and similar resize via ?w=300 — bump to 1200 for hero quality. */
function upscaleResizeParam(u: string): string {
  try {
    const url = new URL(u);
    if (url.searchParams.has("w")) {
      const w = parseInt(url.searchParams.get("w") || "0");
      if (w && w < 1200) url.searchParams.set("w", "1200");
      return url.toString();
    }
    return u;
  } catch { return u; }
}

function parseJsonLd(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch { /* ignore */ }
  }
  return out;
}

function jsonLdValues(blocks: any[], keys: string[]): any[] {
  const out: any[] = [];
  const seen = new WeakSet();
  const visit = (n: any) => {
    if (!n || typeof n !== "object" || seen.has(n)) return;
    seen.add(n);
    for (const k of keys) if (n[k] !== undefined) out.push(n[k]);
    for (const v of Object.values(n)) {
      if (v && typeof v === "object") visit(v);
    }
  };
  blocks.forEach(visit);
  return out;
}

function jsonLdImages(blocks: any[]): string[] {
  const urls: string[] = [];
  for (const v of jsonLdValues(blocks, ["image"])) {
    if (typeof v === "string") urls.push(v);
    else if (Array.isArray(v)) {
      for (const x of v) {
        if (typeof x === "string") urls.push(x);
        else if (x && typeof x === "object" && typeof x.url === "string") urls.push(x.url);
      }
    } else if (v && typeof v === "object" && typeof v.url === "string") urls.push(v.url);
  }
  return urls;
}

function pickFromSrcset(srcset: string): string | null {
  let bestUrl: string | null = null;
  let bestW = -1;
  for (const part of srcset.split(",")) {
    const seg = part.trim().split(/\s+/);
    const u = seg[0];
    const desc = parseInt((seg[1] || "0").replace(/[^\d]/g, ""));
    if (desc >= bestW) { bestW = desc; bestUrl = u; }
  }
  return bestUrl;
}

interface ImgCandidate { url: string; area: number; }

function extractImgTags(html: string, baseUrl: string): ImgCandidate[] {
  const out: ImgCandidate[] = [];
  const seen = new Set<string>();
  const re = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const w = parseInt(tag.match(/\bwidth=["']?(\d+)/i)?.[1] || "0");
    const h = parseInt(tag.match(/\bheight=["']?(\d+)/i)?.[1] || "0");
    // size filter (only if declared)
    if (w && w < 400) continue;
    if (h && h < 300) continue;

    const srcset = tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1]
      || tag.match(/\bdata-srcset=["']([^"']+)["']/i)?.[1];
    let raw: string | null = null;
    if (srcset) raw = pickFromSrcset(srcset);
    if (!raw) {
      raw =
        tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1] ||
        tag.match(/\bdata-lazy-src=["']([^"']+)["']/i)?.[1] ||
        tag.match(/\bdata-original=["']([^"']+)["']/i)?.[1] ||
        tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] ||
        null;
      // If src looked like a placeholder, prefer data-src
      if (raw && /placeholder|blank|1x1|\.gif$/i.test(raw)) {
        const lazy =
          tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1] ||
          tag.match(/\bdata-lazy-src=["']([^"']+)["']/i)?.[1] ||
          tag.match(/\bdata-original=["']([^"']+)["']/i)?.[1];
        if (lazy) raw = lazy;
      }
    }
    const url = normalizeUrl(raw, baseUrl);
    if (!url || !isAcceptableImageUrl(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, area: w * h });
  }
  return out;
}

function extractCssBackgroundImages(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const re = /background(?:-image)?\s*:\s*url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const u = normalizeUrl(m[1], baseUrl);
    if (u && isAcceptableImageUrl(u)) out.push(u);
  }
  return out;
}

async function verifyImageUrl(url: string): Promise<{ ok: boolean; size: number }> {
  try {
    const u = new URL(url);
    if (isBlockedHost(u.hostname)) return { ok: false, size: 0 };
    // SSRF guard: never follow redirects — an allowed host could 3xx to an internal address.
    const r = await fetch(url, { method: "HEAD", redirect: "manual" });
    if (r.status >= 300 && r.status < 400) return { ok: false, size: 0 };
    if (!r.ok) {
      // some CDNs reject HEAD — try a tiny GET, still no redirect following
      const r2 = await fetch(url, { method: "GET", redirect: "manual", headers: { Range: "bytes=0-1024" } });
      if (r2.status >= 300 && r2.status < 400) return { ok: false, size: 0 };
      if (!r2.ok) return { ok: false, size: 0 };
      const ct2 = r2.headers.get("content-type") || "";
      if (!ct2.toLowerCase().startsWith("image/")) return { ok: false, size: 0 };
      try { await r2.body?.cancel(); } catch { /* ignore */ }
      return { ok: true, size: parseInt(r2.headers.get("content-length") || "0") };
    }
    const ct = r.headers.get("content-type") || "";
    if (!ct.toLowerCase().startsWith("image/")) return { ok: false, size: 0 };
    return { ok: true, size: parseInt(r.headers.get("content-length") || "0") };
  } catch { return { ok: false, size: 0 }; }
}


/**
 * Build an ordered list of image candidates following the priority pipeline:
 * 1) og:image  2) twitter:image  3) JSON-LD image
 * 4) largest <img> inside the article body
 * 5) srcset largest descriptor (from <img> picks)
 * 6) CSS background-image inside article body
 * + famouscampaigns.com special selectors
 */
function buildImageCandidates(
  fullHtml: string,
  articleHtml: string,
  baseUrl: string,
): string[] {
  const out: string[] = [];
  const push = (raw: string | null | undefined) => {
    const u = normalizeUrl(raw, baseUrl);
    if (!u || !isAcceptableImageUrl(u)) return;
    const upscaled = upscaleResizeParam(u);
    if (!out.includes(upscaled)) out.push(upscaled);
  };

  // famouscampaigns.com / ad-archive specific containers — try these first for high signal
  const host = (() => { try { return new URL(baseUrl).hostname; } catch { return ""; } })();
  if (host.includes("famouscampaigns")) {
    const specialSel = [
      /<[^>]+\bclass=["'][^"']*\b(?:campaign-image|hero-image|featured-image)\b[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*\b(?:data-src|src)=["']([^"']+)["']/i,
      /<figure\b[^>]*>[\s\S]*?<img\b[^>]*\b(?:data-src|src)=["']([^"']+)["']/i,
    ];
    for (const re of specialSel) {
      const m = articleHtml.match(re) || fullHtml.match(re);
      if (m) push(m[1]);
    }
  }

  // 1 & 2: meta share images
  push(pickMeta(fullHtml, ["og:image", "og:image:secure_url", "og:image:url"]));
  push(pickMeta(fullHtml, ["twitter:image", "twitter:image:src"]));

  // 3: JSON-LD
  const ld = parseJsonLd(fullHtml);
  for (const u of jsonLdImages(ld)) push(u);

  // 4 + 5: article body <img> tags (sorted by declared area desc)
  const tagImgs = extractImgTags(articleHtml, baseUrl)
    .sort((a, b) => b.area - a.area);
  for (const c of tagImgs) push(c.url);

  // 6: CSS background images inside article body
  for (const u of extractCssBackgroundImages(articleHtml, baseUrl)) push(u);

  return out;
}

/** Verify candidates in order; return the first that passes HEAD + image/* check. */
async function pickFirstValidImage(
  candidates: string[],
): Promise<{ url: string | null; verified: string[] }> {
  const verified: string[] = [];
  let primary: string | null = null;
  // Verify up to 12 to avoid runaway fetches
  for (const c of candidates.slice(0, 12)) {
    const v = await verifyImageUrl(c);
    if (v.ok) {
      verified.push(c);
      if (!primary) primary = c;
    }
  }
  return { url: primary, verified };
}

/* ─────────────────────────── Metadata helpers ───────────────────────────── */

function extractYearFromText(text: string): number | null {
  const re = /\b(19[5-9]\d|20[0-2]\d|2026)\b/g;
  let best: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const y = parseInt(m[1]);
    if (y >= 1950 && y <= 2026) {
      if (best === null || y > best) best = y;
    }
  }
  return best;
}

function extractLabeled(text: string, labels: string[]): string | null {
  for (const lab of labels) {
    const re = new RegExp(`${lab}\\s*[:\\-–]\\s*([A-Z][A-Za-z0-9&.,'+\\-/ ]{1,80})`, "i");
    const m = text.match(re);
    if (m) {
      const v = m[1].trim().replace(/\s{2,}.*$/, "").replace(/[.,;]+$/, "");
      if (v.length > 1) return v;
    }
  }
  return null;
}

function cleanTitle(title: string): string {
  return title.split(/\s+[|–-]\s+/)[0].trim();
}

/* ─────────────────────────────── scrapeGeneric ──────────────────────────── */

async function scrapeGeneric(url: string): Promise<Scraped> {
  const { html } = await fetchPageHtml(url);

  const articleHtml = extractArticleBody(html);
  const articleText = htmlToText(articleHtml).slice(0, 4000);
  const ld = parseJsonLd(html);

  // ---- Title ----
  let title =
    pickMeta(html, ["og:title"]) ||
    pickMeta(html, ["twitter:title"]) ||
    (jsonLdValues(ld, ["name", "headline"])[0] as string | undefined) ||
    articleHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ||
    new URL(url).hostname;
  title = htmlToText(String(title));
  title = cleanTitle(title);

  // ---- Brand / Client ----
  const ldBrand =
    jsonLdValues(ld, ["brand"])
      .map((v) => (typeof v === "string" ? v : v?.name))
      .find((v) => typeof v === "string" && v.trim().length > 0) ||
    jsonLdValues(ld, ["author"])
      .map((v) => (typeof v === "string" ? v : v?.name))
      .find((v) => typeof v === "string" && v.trim().length > 0);
  const labeledBrand =
    extractLabeled(articleText, ["Client", "Brand", "Advertiser"]);
  const siteName = pickMeta(html, ["og:site_name"]) || "";
  const brandGuess =
    (typeof ldBrand === "string" ? ldBrand : null) ||
    labeledBrand ||
    (siteName && !/famouscampaigns|adweek|adage|campaign|lbb|creativity|shots|the drum/i.test(siteName)
      ? siteName
      : "");

  // ---- Agency ----
  const labeledAgency =
    extractLabeled(articleText, ["Agency", "Created by", "Developed by", "Creative Agency"]);
  const ldAgency = jsonLdValues(ld, ["creator", "producer"])
    .map((v) => (typeof v === "string" ? v : v?.name))
    .find((v) => typeof v === "string" && v.trim().length > 0);
  const agencyGuess = labeledAgency || (typeof ldAgency === "string" ? ldAgency : null) || null;

  // ---- Year ----
  const ldDate = jsonLdValues(ld, ["datePublished", "dateCreated"])
    .find((v) => typeof v === "string");
  const ogDate = pickMeta(html, ["article:published_time", "og:article:published_time"]);
  const timeTag = html.match(/<time\b[^>]*\bdatetime=["']([^"']+)["']/i)?.[1];
  let yearGuess: number | null = null;
  for (const d of [ldDate, ogDate, timeTag]) {
    if (typeof d === "string") {
      const y = parseInt(d.slice(0, 4));
      if (y >= 1950 && y <= 2026) { yearGuess = y; break; }
    }
  }
  if (!yearGuess) yearGuess = extractYearFromText(articleText);

  // ---- Image candidates → pick first verified ----
  const ogVideo = pickMeta(html, ["og:video", "og:video:url", "og:video:secure_url"]);
  const candidates = buildImageCandidates(html, articleHtml, url);
  const { url: primary, verified } = await pickFirstValidImage(candidates);

  // Some campaign CDNs (Cloudflare-fronted) reject HEAD/GET from the edge, so
  // verification can wrongly drop every image. When that happens but we DID find
  // candidates, trust the ordered candidates rather than returning nothing.
  let images = verified;
  let thumb = primary;
  if (verified.length === 0 && candidates.length > 0) {
    images = candidates.slice(0, 12);
    thumb = images[0];
  }
  const image_warning = !thumb && !ogVideo;

  return {
    title: title.slice(0, 250) || new URL(url).hostname,
    source_url: url,
    thumbnail_url: thumb,
    type: ogVideo ? "video" : (thumb ? "image" : "link"),
    brand_guess: brandGuess || "",
    agency_guess: agencyGuess,
    year_guess: yearGuess,
    images,
    body_text: articleText.slice(0, 3500),
    image_warning,
  };
}

async function inferMetadata(
  scraped: Scraped,
  categories: { video: string[]; photo: string[] },
): Promise<{
  brand: string | null;
  agency: string | null;
  categories: string[];
  tags: string[];
  year: number | null;
  clean_title: string;
}> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const fallback = {
    brand: scraped.brand_guess || null,
    agency: scraped.agency_guess || null,
    categories: [] as string[],
    tags: [] as string[],
    year: scraped.year_guess ?? null,
    clean_title: scraped.title,
  };
  if (!apiKey) return fallback;
  const allowed = scraped.type === "video" ? categories.video : categories.photo;
  const sys =
    `You are a metadata extractor for an advertising/creative reference archive.\n` +
    `Given a raw title, source URL, site name, and the article body text, return:\n` +
    `- brand: the advertised brand/client name (NOT the agency, director or platform). Null if unknown.\n` +
    `- agency: the creative agency that made the work (e.g. "Wieden+Kennedy", "Rethink", "BBH"). Null if not mentioned.\n` +
    `- categories: pick 0-2 from this allowed list ONLY: ${JSON.stringify(allowed)}.\n` +
    `- tags: 2-5 short lowercase keywords (style, medium, mood, theme).\n` +
    `- year: 4-digit release year if discernible (use article date if present), else null.\n` +
    `- clean_title: the actual creative/campaign name. Strip the brand, the agency, ` +
    `category-like words ("Case Study", "Commercial", "Promo", "Campaign"), publication ` +
    `name suffixes (e.g. "| Famous Campaigns"), and " by <Agency>". Keep only the spot/campaign ` +
    `name. If the raw title is just a headline ("Brand does X"), distill it into a short campaign title. ` +
    `If nothing meaningful remains, return the original title.`;
  const body = (scraped.body_text || "").slice(0, 2500);
  const user =
    `Raw title: ${scraped.title}\n` +
    `URL: ${scraped.source_url}\n` +
    `Site/Author: ${scraped.brand_guess || ""}\n` +
    `Type: ${scraped.type}\n` +
    `Hints (verify against body, may be wrong): brand=${scraped.brand_guess || "?"}, agency=${scraped.agency_guess || "?"}, year=${scraped.year_guess ?? "?"}\n` +
    (body ? `Article body:\n${body}\n` : "");
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "set_metadata",
              parameters: {
                type: "object",
                properties: {
                  brand: { type: ["string", "null"] },
                  agency: { type: ["string", "null"] },
                  categories: { type: "array", items: { type: "string" } },
                  tags: { type: "array", items: { type: "string" } },
                  year: { type: ["integer", "null"] },
                  clean_title: { type: "string" },
                },
                required: ["brand", "agency", "categories", "tags", "year", "clean_title"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "set_metadata" } },
      }),
    });
    if (!r.ok) {
      console.error("AI gateway error", r.status, await r.text());
      return fallback;
    }
    const data = await r.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return fallback;
    const parsed = JSON.parse(args);
    const cleaned = (parsed.clean_title || "").trim();
    const yr = Number.isInteger(parsed.year) ? parsed.year : null;
    return {
      brand: parsed.brand || scraped.brand_guess || null,
      agency: parsed.agency || scraped.agency_guess || null,
      categories: (parsed.categories || []).filter((c: string) => allowed.includes(c)),
      tags: (parsed.tags || []).map((t: string) => String(t).toLowerCase()).slice(0, 6),
      year: (yr && yr >= 1950 && yr <= 2026) ? yr : (scraped.year_guess ?? null),
      clean_title: cleaned.length > 1 ? cleaned : scraped.title,
    };
  } catch (e) {
    console.error("inferMetadata failed", e);
    return fallback;
  }
}

/**
 * Use AI vision to group page images into distinct creative projects.
 * Returns one cluster per project, each with the indices of its images
 * plus an optional project title. Falls back to a single cluster.
 */
async function groupImagesIntoProjects(
  images: string[],
  pageTitle: string,
  pageUrl: string,
): Promise<{ title?: string | null; image_indices: number[] }[]> {
  const single = [{ title: null, image_indices: images.map((_, i) => i) }];
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey || images.length < 2) return single;

  const sys =
    `You are analyzing images scraped from a single web page that may showcase ` +
    `multiple distinct creative/photo projects (e.g. a portfolio or news article ` +
    `featuring several campaigns). Decide how many DISTINCT projects are present ` +
    `and assign each image to exactly one project. Group images that clearly ` +
    `belong to the same campaign/series (same subject, art direction, brand). ` +
    `If everything is one project, return a single group. Be conservative — ` +
    `do not over-split. Use the original 0-based image indices.`;

  // Cap to keep token usage reasonable
  const capped = images.slice(0, 12);
  const userContent: any[] = [
    {
      type: "text",
      text:
        `Page title: ${pageTitle}\nPage URL: ${pageUrl}\n` +
        `Images (in order, 0-indexed):`,
    },
    ...capped.map((url) => ({ type: "image_url", image_url: { url } })),
  ];

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "set_projects",
              parameters: {
                type: "object",
                properties: {
                  projects: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: ["string", "null"] },
                        image_indices: {
                          type: "array",
                          items: { type: "integer" },
                        },
                      },
                      required: ["title", "image_indices"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["projects"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "set_projects" } },
      }),
    });
    if (!r.ok) {
      console.error("group images AI error", r.status, await r.text());
      return single;
    }
    const data = await r.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return single;
    const parsed = JSON.parse(args);
    const projects = (parsed.projects || []) as {
      title: string | null;
      image_indices: number[];
    }[];
    // Sanitize: keep valid indices, drop empty groups
    const cleaned = projects
      .map((p) => ({
        title: p.title || null,
        image_indices: (p.image_indices || []).filter(
          (i) => Number.isInteger(i) && i >= 0 && i < images.length,
        ),
      }))
      .filter((p) => p.image_indices.length > 0);
    // Ensure every image is assigned somewhere; unassigned go to first group
    const seen = new Set<number>();
    cleaned.forEach((p) => p.image_indices.forEach((i) => seen.add(i)));
    const missing = images.map((_, i) => i).filter((i) => !seen.has(i));
    if (missing.length > 0) {
      if (cleaned.length === 0) return single;
      cleaned[0].image_indices.push(...missing);
    }
    return cleaned.length > 0 ? cleaned : single;
  } catch (e) {
    console.error("groupImagesIntoProjects failed", e);
    return single;
  }
}

async function scrapeAndInsert(
  rawUrl: string,
  supabase: any,
  userId: string,
  categories: { video: string[]; photo: string[] },
) {
  let scraped: Scraped;
  try {
    const u = new URL(rawUrl);
    const yid = ytId(u);
    if (yid) scraped = await scrapeYouTube(rawUrl, yid);
    else if (u.hostname.includes("vimeo.com")) scraped = await scrapeVimeo(rawUrl);
    else scraped = await scrapeGeneric(rawUrl);
  } catch (e) {
    return { ok: false, url: rawUrl, error: e instanceof Error ? e.message : "scrape failed" };
  }

  const meta = await inferMetadata(scraped, categories);
  const allImages = (scraped.images || []).filter(Boolean);

  // ===== Image page with multiple potential projects =====
  if (scraped.type === "image" && allImages.length >= 2) {
    const groups = await groupImagesIntoProjects(allImages, scraped.title, scraped.source_url);
    if (groups.length > 1) {
      const drafts: any[] = [];
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        const items = g.image_indices.map((idx) => ({
          url: allImages[idx],
          kind: "image" as const,
        }));
        if (items.length === 0) continue;
        const titleBase = (g.title && g.title.trim()) || meta.clean_title || scraped.title;
        const title = groups.length > 1 && !g.title
          ? `${titleBase} (${i + 1})`
          : titleBase;
        const row = {
          title,
          type: "image",
          source_url: scraped.source_url,
          thumbnail_url: items[0].url,
          media_url: items[0].url,
          media_items: items,
          brand: meta.brand,
          agency: meta.agency,
          year: meta.year,
          categories: meta.categories,
          tags: meta.tags,
          created_by: userId,
          published: false,
          source: "ai_scrape",
        };
        const { data: inserted, error: insErr } = await supabase
          .from("references")
          .insert(row)
          .select("id, title, thumbnail_url, brand, categories, tags, type")
          .single();
        if (!insErr && inserted) drafts.push(inserted);
        else if (insErr) console.error("insert split draft failed", insErr.message);
      }
      if (drafts.length > 0) {
        return { ok: true, draft: drafts[0], drafts, split: true };
      }
    }
  }

  const mediaItems =
    scraped.type === "image"
      ? (allImages.length > 0
          ? allImages.map((u) => ({ url: u, kind: "image" as const }))
          : (scraped.thumbnail_url ? [{ url: scraped.thumbnail_url, kind: "image" as const }] : []))
      : [];

  const insertRow = {
    title: meta.clean_title || scraped.title,
    type: scraped.type,
    source_url: scraped.source_url,
    thumbnail_url: scraped.thumbnail_url || (mediaItems[0]?.url ?? null),
    media_url: scraped.type === "image" ? (mediaItems[0]?.url ?? scraped.thumbnail_url) : null,
    media_items: mediaItems,
    brand: meta.brand,
    agency: meta.agency,
    year: meta.year,
    categories: meta.categories,
    tags: meta.tags,
    created_by: userId,
    published: false,
    source: "ai_scrape",
  };

  const { data: inserted, error: insErr } = await supabase
    .from("references")
    .insert(insertRow)
    .select("id, title, thumbnail_url, brand, categories, tags, type")
    .single();
  if (insErr) return { ok: false, url: rawUrl, error: insErr.message };
  return { ok: true, draft: inserted, image_warning: !!scraped.image_warning };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Invalid token" }, 401);
    const userId = userData.user.id;

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const rawUrl = String(body.url || "").trim();
    if (!rawUrl) return json({ error: "URL required" }, 400);
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return json({ error: "Invalid URL" }, 400);
    }
    if (!["http:", "https:"].includes(url.protocol)) return json({ error: "Invalid URL" }, 400);
    if (isBlockedHost(url.hostname)) return json({ error: "Host not allowed" }, 400);

    // Load category lists
    const { data: settings } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["video_categories", "photo_categories"]);
    const map = new Map((settings || []).map((r: any) => [r.key, r.value]));
    const categories = {
      video: (map.get("video_categories") as string[]) || [
        "Commercials",
        "Promos / Trailers",
        "Case Studies",
        "Social Content",
      ],
      photo: (map.get("photo_categories") as string[]) || ["Campaign", "Branding", "Copy Driven"],
    };

    // ===== YouTube playlist: expand into one draft per video =====
    const playlistId = ytPlaylistId(url);
    if (playlistId) {
      const ids = await fetchPlaylistVideoIds(playlistId);
      if (ids.length === 0) {
        return json({ error: "Could not read playlist (empty or private)" }, 400);
      }
      const drafts: any[] = [];
      const failed: any[] = [];
      // Sequential to be polite to YouTube/AI gateway
      for (const id of ids) {
        const videoUrl = `https://www.youtube.com/watch?v=${id}`;
        const result = await scrapeAndInsert(videoUrl, supabase, userId, categories);
        if (result.ok) drafts.push(result.draft);
        else failed.push({ url: videoUrl, error: result.error });
      }
      return json({
        success: true,
        playlist: true,
        playlist_id: playlistId,
        count: drafts.length,
        failed_count: failed.length,
        drafts,
        failed,
      });
    }

    // ===== Single URL =====
    const result = await scrapeAndInsert(rawUrl, supabase, userId, categories);
    if (!result.ok) return json({ error: result.error }, 500);
    if ((result as any).split && Array.isArray((result as any).drafts)) {
      const drafts = (result as any).drafts;
      return json({ success: true, split: true, count: drafts.length, drafts, draft: drafts[0] });
    }
    return json({ success: true, draft: result.draft, image_warning: !!(result as any).image_warning });
  } catch (e) {
    console.error("scrape-link error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
