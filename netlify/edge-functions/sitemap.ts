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
  // Original collections
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
  // Brands
  { section: "best-of", slug: "apple-best-ads" },
  { section: "best-of", slug: "coca-cola-best-ads" },
  { section: "best-of", slug: "mcdonalds-best-ads" },
  { section: "best-of", slug: "volkswagen-best-ads" },
  { section: "best-of", slug: "guinness-best-ads" },
  { section: "best-of", slug: "old-spice-best-ads" },
  { section: "best-of", slug: "dove-best-ads" },
  { section: "best-of", slug: "budweiser-best-ads" },
  { section: "best-of", slug: "bmw-best-ads" },
  { section: "best-of", slug: "ikea-best-ads" },
  { section: "best-of", slug: "lego-best-ads" },
  { section: "best-of", slug: "amazon-best-ads" },
  { section: "best-of", slug: "google-best-ads" },
  { section: "best-of", slug: "absolut-best-ads" },
  { section: "best-of", slug: "pepsi-best-ads" },
  { section: "best-of", slug: "adidas-best-ads" },
  { section: "best-of", slug: "spotify-best-ads" },
  { section: "best-of", slug: "john-lewis-christmas-ads" },
  { section: "best-of", slug: "heinz-best-ads" },
  { section: "best-of", slug: "burger-king-best-ads" },
  // Decades
  { section: "best-of", slug: "best-ads-of-the-1980s" },
  { section: "best-of", slug: "best-ads-of-the-1990s" },
  { section: "best-of", slug: "best-ads-of-the-2000s" },
  { section: "best-of", slug: "best-ads-of-the-2010s" },
  { section: "best-of", slug: "best-ads-of-the-2020s" },
  // Formats
  { section: "best-of", slug: "best-outdoor-advertising" },
  { section: "best-of", slug: "best-social-media-campaigns" },
  { section: "best-of", slug: "best-viral-ads" },
  { section: "best-of", slug: "best-animated-ads" },
  { section: "best-of", slug: "best-guerrilla-marketing" },
  { section: "best-of", slug: "best-interactive-campaigns" },
  { section: "best-of", slug: "best-long-form-ads" },
  { section: "best-of", slug: "best-digital-campaigns" },
  { section: "best-of", slug: "best-integrated-campaigns" },
  { section: "best-of", slug: "best-tv-commercials" },
  // Themes
  { section: "best-of", slug: "best-christmas-ads" },
  { section: "best-of", slug: "best-sports-ads" },
  { section: "best-of", slug: "best-olympic-ads" },
  { section: "best-of", slug: "mental-health-campaigns" },
  { section: "best-of", slug: "sustainability-campaigns" },
  { section: "best-of", slug: "lgbtq-campaigns" },
  { section: "best-of", slug: "diversity-and-inclusion-campaigns" },
  { section: "best-of", slug: "body-positivity-campaigns" },
  { section: "best-of", slug: "cause-marketing-campaigns" },
  { section: "best-of", slug: "best-public-service-ads" },
  { section: "best-of", slug: "music-in-advertising" },
  { section: "best-of", slug: "best-comedy-ads" },
  { section: "best-of", slug: "nostalgia-advertising" },
  { section: "best-of", slug: "celebrity-campaigns" },
  { section: "best-of", slug: "shock-advertising" },
  // Industries
  { section: "best-of", slug: "best-automotive-ads" },
  { section: "best-of", slug: "best-beer-ads" },
  { section: "best-of", slug: "best-fashion-campaigns" },
  { section: "best-of", slug: "best-tech-ads" },
  { section: "best-of", slug: "best-luxury-campaigns" },
  { section: "best-of", slug: "best-food-and-drink-ads" },
  { section: "best-of", slug: "best-travel-ads" },
  { section: "best-of", slug: "best-retail-campaigns" },
  { section: "best-of", slug: "best-nonprofit-campaigns" },
  { section: "best-of", slug: "best-healthcare-ads" },
  // Craft
  { section: "best-of", slug: "best-copywriting-in-advertising" },
  { section: "best-of", slug: "minimalist-advertising" },
  { section: "best-of", slug: "best-storytelling-ads" },
  { section: "best-of", slug: "black-and-white-advertising" },
  { section: "best-of", slug: "cinematic-advertising" },
  { section: "best-of", slug: "best-typographic-ads" },
  { section: "best-of", slug: "illustration-in-advertising" },
  { section: "best-of", slug: "best-photography-campaigns" },
  { section: "best-of", slug: "data-driven-advertising" },
  { section: "best-of", slug: "best-brand-activations" },
  // Occasions
  { section: "best-of", slug: "fathers-day-ads" },
  { section: "best-of", slug: "mothers-day-ads" },
  { section: "best-of", slug: "valentines-day-ads" },
  { section: "best-of", slug: "back-to-school-campaigns" },
  // Awards
  { section: "best-of", slug: "dad-pencil-winners" },
  { section: "best-of", slug: "clio-award-winners" },
  { section: "best-of", slug: "one-show-winners" },
  { section: "best-of", slug: "effie-award-winners" },
  // Cultural moments
  { section: "best-of", slug: "ads-that-changed-advertising" },
  { section: "best-of", slug: "most-controversial-ads" },
  { section: "best-of", slug: "reactive-marketing-campaigns" },
  { section: "best-of", slug: "best-rebranding-campaigns" },
  { section: "best-of", slug: "brand-comeback-campaigns" },
  { section: "best-of", slug: "ads-that-sparked-debate" },
  // Countries
  { section: "best-of", slug: "best-british-ads" },
  { section: "best-of", slug: "best-australian-ads" },
  { section: "best-of", slug: "best-indian-ads" },
  { section: "best-of", slug: "best-japanese-ads" },
  { section: "best-of", slug: "best-american-ads" },
  // Additional themes
  { section: "best-of", slug: "gaming-advertising" },
  { section: "best-of", slug: "anti-smoking-campaigns" },
  { section: "best-of", slug: "drink-driving-campaigns" },
  { section: "best-of", slug: "humanitarian-campaigns" },
  { section: "best-of", slug: "animal-rights-campaigns" },
  { section: "best-of", slug: "financial-services-advertising" },
  { section: "best-of", slug: "comparison-advertising" },
  { section: "best-of", slug: "user-generated-content-campaigns" },
  { section: "best-of", slug: "teaser-campaigns" },
  { section: "best-of", slug: "purpose-driven-brands" },
  { section: "best-of", slug: "loneliness-campaigns" },
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
