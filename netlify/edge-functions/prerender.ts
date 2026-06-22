import type { Config, Context } from "https://edge.netlify.com/";

const SUPABASE_URL = "https://vaogvackqxfhureqbprw.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhb2d2YWNrcXhmaHVyZXFicHJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjkzNTAsImV4cCI6MjA5MjcwNTM1MH0.bGjq5zS63BnBvOPTBQ72wiAFPuF4CeKU_1h4vo9WA0I";

const DEFAULT_OG_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/85b2d7b6-2ea9-40f1-9a84-ff6ce724a400/id-preview-6e9b7ec6--c1071d5f-a0f4-47b6-a6b0-b43f20d0a8c0.lovable.app-1777200045504.png";

const SITE = "https://thecreativesroom.com";

// Known social/search bot user-agents that need pre-rendered OG tags.
const BOT_RE =
  /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|WhatsApp|TelegramBot|Slackbot|Discordbot|Googlebot|bingbot|Applebot|DuckDuckBot|ia_archiver|python-requests|curl\/|wget\//i;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default async (request: Request, context: Context) => {
  const ua = request.headers.get("user-agent") ?? "";
  if (!BOT_RE.test(ua)) return context.next();

  const { pathname } = new URL(request.url);
  const segment = pathname.replace(/^\/ref\//, "");
  const id = UUID_RE.exec(segment)?.[0];
  if (!id) return context.next();

  let ref: Record<string, any> | null = null;
  try {
    const apiUrl =
      `${SUPABASE_URL}/rest/v1/references` +
      `?id=eq.${id}&published=eq.true` +
      `&select=id,title,type,brand,agency,year,thumbnail_url,source_url,visual_summary,notes,categories` +
      `&limit=1`;
    const res = await fetch(apiUrl, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (res.ok) {
      const rows = await res.json();
      ref = Array.isArray(rows) ? rows[0] ?? null : null;
    }
  } catch {
    // Fall through to SPA on any fetch error
  }

  if (!ref) return context.next();

  const slug = toSlug(ref.title ?? "");
  const canonicalPath = slug ? `/ref/${id}-${slug}` : `/ref/${id}`;
  const canonicalUrl = `${SITE}${canonicalPath}`;

  const metaParts = [ref.brand, ref.agency, ref.year ? String(ref.year) : null].filter(Boolean);
  const bodyText = ref.visual_summary || ref.notes || "";
  const description = metaParts.length
    ? `${metaParts.join(" · ")}. ${bodyText.slice(0, 140) || "Creative reference on The Creatives Room."}`
    : bodyText.slice(0, 200) || "Creative reference on The Creatives Room.";

  const derivedThumb = await (async () => {
    const src: string = ref.source_url ?? "";
    try {
      const u = new URL(src);
      if (u.hostname.includes("youtube.com")) {
        const vid = u.searchParams.get("v")
          || (u.pathname.startsWith("/shorts/") ? u.pathname.split("/")[2] : null)
          || (u.pathname.startsWith("/embed/") ? u.pathname.split("/")[2] : null);
        if (vid) return `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
      }
      if (u.hostname === "youtu.be") {
        const vid = u.pathname.slice(1);
        if (vid) return `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
      }
      if (u.hostname.includes("vimeo.com")) {
        try {
          const r = await fetch(
            `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(src)}`,
            { signal: AbortSignal.timeout(2500) }
          );
          if (r.ok) {
            const data = await r.json();
            if (data?.thumbnail_url) return data.thumbnail_url as string;
          }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    return null;
  })();

  const ogImage = ref.thumbnail_url ?? derivedThumb ?? DEFAULT_OG_IMAGE;
  const title = escape(`${ref.title ?? "Reference"} — The Creatives Room`);
  const desc = escape(description.slice(0, 200));
  const img = escape(ogImage);
  const url = escape(canonicalUrl);

  const schemaType = ref.type === "video" ? "VideoObject" : ref.type === "image" ? "ImageObject" : "CreativeWork";
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": schemaType,
    name: ref.title,
    url: canonicalUrl,
    image: ogImage,
    thumbnailUrl: ogImage,
    ...(bodyText ? { description: bodyText.slice(0, 300) } : {}),
    ...(ref.brand ? { brand: { "@type": "Brand", name: ref.brand } } : {}),
    ...(ref.year ? { datePublished: `${ref.year}-01-01` } : {}),
    ...(Array.isArray(ref.categories) && ref.categories.length
      ? { genre: ref.categories }
      : {}),
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${desc}" />
  <link rel="canonical" href="${url}" />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="The Creatives Room" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${img}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@thecreativesroom" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${desc}" />
  <meta name="twitter:image" content="${img}" />

  <script type="application/ld+json">${jsonLd}</script>
  <meta http-equiv="refresh" content="0; url=${url}" />
  <script>window.location.replace(${JSON.stringify(canonicalUrl)});</script>
</head>
<body>
  <p>Redirecting to <a href="${url}">${title}</a>…</p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
};

export const config: Config = { path: "/ref/*" };
