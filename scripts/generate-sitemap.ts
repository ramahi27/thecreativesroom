import { writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = "https://thecreativesroom.com";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://vaogvackqxfhureqbprw.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhb2d2YWNrcXhmaHVyZXFicHJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjkzNTAsImV4cCI6MjA5MjcwNTM1MH0.bGjq5zS63BnBvOPTBQ72wiAFPuF4CeKU_1h4vo9WA0I";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "folder";
}

async function fetchDynamicEntries(): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = [];

  // Published references
  const { data: refs } = await supabase
    .from("references")
    .select("id,title,updated_at")
    .eq("published", true)
    .order("created_at", { ascending: false });

  for (const r of refs || []) {
    const titleSlug = (r.title || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    const path = titleSlug ? `/ref/${r.id}-${titleSlug}` : `/ref/${r.id}`;
    entries.push({
      path,
      lastmod: r.updated_at ? r.updated_at.slice(0, 10) : undefined,
      changefreq: "weekly",
      priority: "0.8",
    });
  }

  // Profiles with usernames
  const { data: profiles } = await supabase
    .from("profiles")
    .select("username,updated_at");

  const usernameSet = new Set<string>();
  for (const p of profiles || []) {
    if (p.username) {
      usernameSet.add(p.username);
      entries.push({
        path: `/u/${p.username}`,
        lastmod: p.updated_at ? p.updated_at.slice(0, 10) : undefined,
        changefreq: "weekly",
        priority: "0.7",
      });
    }
  }

  // Public folders
  const { data: folders } = await supabase
    .from("folders")
    .select("id,name,is_public,user_id,updated_at")
    .eq("is_public", true);

  for (const f of folders || []) {
    const profile = (profiles || []).find((p) => p.username && p.username.toLowerCase() === f.user_id?.toLowerCase?.());
    // Need username from profiles — match by user_id
  }

  // Re-fetch folders with username join via RPC or separate query
  // Actually, profiles has user_id. Let's get user_id too.
  const { data: profilesWithId } = await supabase
    .from("profiles")
    .select("user_id,username");

  const userIdToUsername = new Map<string, string>();
  for (const p of profilesWithId || []) {
    if (p.user_id && p.username) {
      userIdToUsername.set(p.user_id, p.username);
    }
  }

  for (const f of folders || []) {
    const username = userIdToUsername.get(f.user_id);
    if (username) {
      entries.push({
        path: `/u/${username}/${slugify(f.name)}`,
        lastmod: f.updated_at ? f.updated_at.slice(0, 10) : undefined,
        changefreq: "weekly",
        priority: "0.6",
      });
    }
  }

  return entries;
}

function generateSitemap(entries: SitemapEntry[]) {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n")
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

async function main() {
  const staticEntries: SitemapEntry[] = [
    { path: "/", changefreq: "weekly", priority: "1.0" },
    { path: "/welcome", changefreq: "monthly", priority: "0.5" },
    { path: "/privacy", changefreq: "yearly", priority: "0.3" },
    { path: "/terms", changefreq: "yearly", priority: "0.3" },
  ];

  const dynamicEntries = await fetchDynamicEntries();
  const allEntries = [...staticEntries, ...dynamicEntries];

  writeFileSync(resolve("public/sitemap.xml"), generateSitemap(allEntries));
  console.log(`sitemap.xml written (${allEntries.length} entries)`);
}

main().catch((err) => {
  console.error("Failed to generate sitemap:", err);
  process.exit(1);
});
