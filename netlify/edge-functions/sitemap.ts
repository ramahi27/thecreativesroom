import type { Config, Context } from "https://edge.netlify.com/";

const SUPABASE_URL = "https://vaogvackqxfhureqbprw.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhb2d2YWNrcXhmaHVyZXFicHJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjkzNTAsImV4cCI6MjA5MjcwNTM1MH0.bGjq5zS63BnBvOPTBQ72wiAFPuF4CeKU_1h4vo9WA0I";
const SITE = "https://thecreativesroom.com";

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const STATIC_PAGES = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/best-of", priority: "0.9", changefreq: "weekly" },
];

const COLLECTIONS = [
  { section: "best-of", slug: "cannes-lions-grand-prix-winners" },
  { section: "best-of", slug: "female-led-campaigns" },
  { section: "best-of", slug: "best-print-ads" },
  { section: "best-of", slug: "super-bowl-commercials" },
  { section: "best-of", slug: "emotional-ads-that-make-you-cry" },
  { section: "best-of", slug: "award-winning-campaigns" },
  { section: "best-of", slug: "nike-best-ads" },
  { section: "agencies", slug: "wieden-and-kennedy-best-work" },
  { section: "agencies", slug: "ogilvy-best-campaigns" },
  { section: "agencies", slug: "bbdo-best-work" },
];

export default async (_request: Request, _context: Context) => {
  let refs: { id: string; title: string; updated_at: string }[] = [];
  try {
    const apiUrl =
      `${SUPABASE_URL}/rest/v1/references` +
      `?published=eq.true&select=id,title,updated_at&order=created_at.desc&limit=2000`;
    const res = await fetch(apiUrl, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (res.ok) refs = await res.json();
  } catch { /* fall through with empty refs */ }

  const today = new Date().toISOString().slice(0, 10);
  const urlTags: string[] = [];

  for (const p of STATIC_PAGES) {
    urlTags.push(
      `  <url><loc>${SITE}${p.path}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority><lastmod>${today}</lastmod></url>`
    );
  }

  for (const c of COLLECTIONS) {
    urlTags.push(
      `  <url><loc>${SITE}/${c.section}/${c.slug}</loc><changefreq>monthly</changefreq><priority>0.9</priority><lastmod>${today}</lastmod></url>`
    );
  }

  for (const ref of refs) {
    const slug = toSlug(ref.title ?? "");
    const path = slug ? `/ref/${ref.id}-${slug}` : `/ref/${ref.id}`;
    const lastmod = ref.updated_at ? ref.updated_at.slice(0, 10) : today;
    urlTags.push(
      `  <url><loc>${SITE}${path}</loc><changefreq>monthly</changefreq><priority>0.7</priority><lastmod>${lastmod}</lastmod></url>`
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlTags.join("\n")}\n</urlset>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
};

export const config: Config = { path: "/sitemap.xml" };
