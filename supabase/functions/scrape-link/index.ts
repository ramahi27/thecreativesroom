// Scrape a YouTube / Vimeo / generic web page link, infer metadata via Lovable AI,
// and insert as a draft reference. Admin-only (verified server-side).
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

async function scrapeYouTube(url: string, id: string): Promise<Scraped> {
  // oEmbed gives title + author
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

async function scrapeGeneric(url: string): Promise<Scraped> {
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; CreativesRoomBot/1.0; +https://thecreativesroom.com)",
    },
  });
  const html = await r.text();
  const title =
    pickMeta(html, ["og:title", "twitter:title"]) ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
    new URL(url).hostname;
  let thumb = pickMeta(html, ["og:image", "twitter:image", "twitter:image:src"]);
  if (thumb && thumb.startsWith("/")) thumb = new URL(thumb, url).toString();
  const siteName = pickMeta(html, ["og:site_name"]) || "";
  const ogVideo = pickMeta(html, ["og:video", "og:video:url", "og:video:secure_url"]);
  return {
    title: title.slice(0, 250),
    source_url: url,
    thumbnail_url: thumb,
    type: ogVideo ? "video" : thumb ? "image" : "link",
    brand_guess: siteName,
  };
}

async function scrapeUrl(rawUrl: string): Promise<Scraped> {
  const url = new URL(rawUrl);
  const yid = ytId(url);
  if (yid) return scrapeYouTube(rawUrl, yid);
  if (url.hostname.includes("vimeo.com")) return scrapeVimeo(rawUrl);
  return scrapeGeneric(rawUrl);
}

async function inferMetadata(
  scraped: Scraped,
  categories: { video: string[]; photo: string[] },
): Promise<{ brand: string | null; categories: string[]; tags: string[]; year: number | null }> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return { brand: scraped.brand_guess || null, categories: [], tags: [], year: null };
  const allowed = scraped.type === "video" ? categories.video : categories.photo;
  const sys =
    `You are a metadata extractor for an advertising/creative reference archive. ` +
    `Given a title, source URL, and possible author/site name, infer:\n` +
    `- brand: the advertised brand name (NOT the agency or platform). Null if unknown.\n` +
    `- categories: pick 0-2 from this allowed list ONLY: ${JSON.stringify(allowed)}.\n` +
    `- tags: 2-5 short lowercase keywords (style, medium, mood, theme).\n` +
    `- year: 4-digit release year if discernible from title, else null.`;
  const user = `Title: ${scraped.title}\nURL: ${scraped.source_url}\nSite/Author: ${scraped.brand_guess || ""}\nType: ${scraped.type}`;
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
                },
                required: ["brand", "categories", "tags", "year"],
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
      return { brand: scraped.brand_guess || null, categories: [], tags: [], year: null };
    }
    const data = await r.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return { brand: scraped.brand_guess || null, categories: [], tags: [], year: null };
    const parsed = JSON.parse(args);
    return {
      brand: parsed.brand || scraped.brand_guess || null,
      categories: (parsed.categories || []).filter((c: string) => allowed.includes(c)),
      tags: (parsed.tags || []).map((t: string) => String(t).toLowerCase()).slice(0, 6),
      year: parsed.year || null,
    };
  } catch (e) {
    console.error("inferMetadata failed", e);
    return { brand: scraped.brand_guess || null, categories: [], tags: [], year: null };
  }
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

    const scraped = await scrapeUrl(rawUrl);
    const meta = await inferMetadata(scraped, categories);

    const mediaItems =
      scraped.type === "image" && scraped.thumbnail_url
        ? [{ url: scraped.thumbnail_url, kind: "image" }]
        : [];

    const insertRow = {
      title: scraped.title,
      type: scraped.type,
      source_url: scraped.source_url,
      thumbnail_url: scraped.thumbnail_url,
      media_url: scraped.type === "image" ? scraped.thumbnail_url : null,
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
    if (insErr) return json({ error: insErr.message }, 500);

    return json({ success: true, draft: inserted });
  } catch (e) {
    console.error("scrape-link error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
