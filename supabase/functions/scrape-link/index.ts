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
  images?: string[];
  body_text?: string;
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
 * Try to isolate the main article body so we don't pull sidebar / "trending"
 * / related-post images and text. Falls back to whole html.
 */
function extractArticleBody(html: string): string {
  // Strip noisy chunks first (sidebars, related, comments, footer, scripts)
  let h = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

  // Try common article containers in priority order
  const patterns: RegExp[] = [
    /<div[^>]*class=["'][^"']*\bentry\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?:<div[^>]*class=["'][^"']*(?:postnav|after|sideframe|related)|<\/article)/i,
    /<article\b[^>]*>([\s\S]*?)<\/article>/i,
    /<main\b[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]*(?:id|class)=["'][^"']*\b(?:post-content|entry-content|article-body|post-body|content-body)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  ];
  for (const re of patterns) {
    const m = h.match(re);
    if (m && m[1] && m[1].length > 200) return m[1];
  }
  return h;
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

async function scrapeGeneric(url: string): Promise<Scraped> {
  const r = await safeFetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; CreativesRoomBot/1.0; +https://thecreativesroom.com)",
    },
  });
  // Reject redirects to avoid SSRF via 3xx to internal hosts
  if (r.status >= 300 && r.status < 400) throw new Error("Redirects not allowed");
  const html = await r.text();
  const title =
    pickMeta(html, ["og:title", "twitter:title"]) ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
    new URL(url).hostname;
  const siteName = pickMeta(html, ["og:site_name"]) || "";
  const ogVideo = pickMeta(html, ["og:video", "og:video:url", "og:video:secure_url"]);

  // Isolate article body so we ignore sidebar / trending / related modules
  const articleHtml = extractArticleBody(html);
  const bodyText = htmlToText(articleHtml).slice(0, 3500);

  // Collect campaign images from the article body only
  const images = collectImages(articleHtml, url, null);
  const thumb = images[0] || null;

  return {
    title: title.slice(0, 250),
    source_url: url,
    thumbnail_url: thumb,
    type: ogVideo ? "video" : (images.length > 0 ? "image" : "link"),
    brand_guess: siteName,
    images,
    body_text: bodyText,
  };
}

/** Skip patterns for non-campaign images (logos, avatars, ads, etc.) */
const SKIP_URL_RE = /logo|avatar|icon|thumbnail|thumb[-_]|author|profile|banner|ads?[-_/]|sponsor|widget|favicon|sprite|placeholder|spinner|emoji/i;

/** Pull hero/main campaign image URLs only. Prefers og:image, then large <img> tags. */
function collectImages(html: string, baseUrl: string, primary: string | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const normalize = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    let u = raw.trim();
    if (!u) return null;
    if (u.startsWith("//")) u = "https:" + u;
    if (u.startsWith("/")) {
      try { u = new URL(u, baseUrl).toString(); } catch { return null; }
    }
    if (!/^https?:\/\//i.test(u)) return null;
    if (/\.(svg)(\?|$)/i.test(u)) return null;
    if (SKIP_URL_RE.test(u)) return null;
    return u;
  };
  const push = (raw: string | null | undefined) => {
    const u = normalize(raw);
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };

  // Skip og:image / twitter:image meta tags — those are page share thumbnails,
  // not campaign hero images. Only use real <img> tags from the page body.
  void primary;

  // 2. <img> tags — only large ones (width attr >= 400, or srcset descriptor >= 600w)
  const imgTagRe = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgTagRe.exec(html)) !== null) {
    const tag = m[0];
    const wAttr = tag.match(/\bwidth=["']?(\d+)/i)?.[1];
    const hAttr = tag.match(/\bheight=["']?(\d+)/i)?.[1];
    const w = wAttr ? parseInt(wAttr) : 0;
    const h = hAttr ? parseInt(hAttr) : 0;
    // If dimensions declared and below threshold, skip
    if (w && w < 400) continue;
    if (h && h > 0 && h < 300) continue;

    const srcset = tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1];
    let chosen: string | null = null;
    let chosenW = 0;
    if (srcset) {
      // Pick largest descriptor >= 600w
      for (const part of srcset.split(",")) {
        const [u, descRaw] = part.trim().split(/\s+/);
        const desc = parseInt(descRaw || "0");
        if (desc >= chosenW) { chosenW = desc; chosen = u; }
      }
      if (chosenW && chosenW < 600) chosen = null;
    }
    if (!chosen) {
      chosen = tag.match(/\b(?:src|data-src|data-lazy-src|data-original)=["']([^"']+)["']/i)?.[1] || null;
    }
    // Without explicit dimensions, only accept if there was a srcset >= 600w,
    // OR the width attr explicitly says >= 600
    const hasGoodSignal = (w >= 600) || (chosenW >= 600);
    if (!hasGoodSignal) continue;
    push(chosen);
  }

  return out.slice(0, 15);
}

async function inferMetadata(
  scraped: Scraped,
  categories: { video: string[]; photo: string[] },
): Promise<{
  brand: string | null;
  categories: string[];
  tags: string[];
  year: number | null;
  clean_title: string;
}> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const fallback = {
    brand: scraped.brand_guess || null,
    categories: [] as string[],
    tags: [] as string[],
    year: null,
    clean_title: scraped.title,
  };
  if (!apiKey) return fallback;
  const allowed = scraped.type === "video" ? categories.video : categories.photo;
  const sys =
    `You are a metadata extractor for an advertising/creative reference archive.\n` +
    `Given a raw title, source URL and possible author/site name, return:\n` +
    `- brand: the advertised brand name (NOT the agency, director or platform). Null if unknown.\n` +
    `- categories: pick 0-2 from this allowed list ONLY: ${JSON.stringify(allowed)}.\n` +
    `- tags: 2-5 short lowercase keywords (style, medium, mood, theme).\n` +
    `- year: 4-digit release year if discernible, else null.\n` +
    `- clean_title: the title with the brand name AND any category-like words removed ` +
    `(e.g. "Case Study", "Commercial", "Promo", "Trailer", "Campaign", "| Brand", " - Brand", " by Director"). ` +
    `Keep only the actual creative/spot name. Trim separators. ` +
    `If nothing meaningful remains, return the original title.`;
  const user = `Raw title: ${scraped.title}\nURL: ${scraped.source_url}\nSite/Author: ${scraped.brand_guess || ""}\nType: ${scraped.type}`;
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
                  categories: { type: "array", items: { type: "string" } },
                  tags: { type: "array", items: { type: "string" } },
                  year: { type: ["integer", "null"] },
                  clean_title: { type: "string" },
                },
                required: ["brand", "categories", "tags", "year", "clean_title"],
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
    return {
      brand: parsed.brand || scraped.brand_guess || null,
      categories: (parsed.categories || []).filter((c: string) => allowed.includes(c)),
      tags: (parsed.tags || []).map((t: string) => String(t).toLowerCase()).slice(0, 6),
      year: parsed.year || null,
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
  return { ok: true, draft: inserted };
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
    return json({ success: true, draft: result.draft });
  } catch (e) {
    console.error("scrape-link error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
