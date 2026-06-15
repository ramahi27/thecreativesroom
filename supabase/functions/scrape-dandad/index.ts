import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const DANDAD_BASE = "https://www.dandad.org";

interface DandadEntry {
  title: string;
  brand: string | null;
  agency: string | null;
  year: number;
  thumbnail_url: string | null;
  source_url: string;
  award_level: string | null;
  discipline: string | null;
}

function upscaleImg(url: string): string {
  return url.replace(/[?&]w=\d+/, (m) => m.replace(/\d+/, "1200"));
}

function getMetaContent(html: string, property: string): string | null {
  const r = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`).exec(html) ||
            new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`).exec(html);
  return r ? r[1] : null;
}

function collectEntries(node: unknown, year: number, depth = 0): DandadEntry[] {
  if (depth > 20 || !node || typeof node !== "object") return [];
  if (Array.isArray(node)) {
    return node.flatMap((n) => collectEntries(n, year, depth + 1));
  }
  const obj = node as Record<string, unknown>;
  const entries: DandadEntry[] = [];

  const hasTitle = typeof obj.title === "string" || typeof obj.name === "string" || typeof obj.entryTitle === "string";
  const hasImage = typeof obj.imageUrl === "string" || typeof obj.thumbnail === "string" ||
                   typeof obj.image === "string" || typeof obj.thumbnailUrl === "string" ||
                   typeof obj.heroImage === "string";

  if (hasTitle && hasImage) {
    const title = (obj.title || obj.name || obj.entryTitle || "") as string;
    const rawImg = (obj.imageUrl || obj.thumbnail || obj.image || obj.thumbnailUrl || obj.heroImage || "") as string;
    const imgUrl = rawImg.startsWith("http") ? rawImg : rawImg ? `${DANDAD_BASE}${rawImg}` : null;
    const slugParts = [obj.slug, obj.path, obj.url, obj.entrySlug].find((v) => typeof v === "string");
    const sourceUrl = slugParts
      ? (slugParts as string).startsWith("http") ? slugParts as string : `${DANDAD_BASE}${slugParts}`
      : DANDAD_BASE;

    const brand = (obj.brand || obj.client || obj.advertiser || null) as string | null;
    const agency = (obj.agency || obj.entrant || obj.agencyName || null) as string | null;
    const awardLevel = (obj.award || obj.awardLevel || obj.pencil || null) as string | null;
    const discipline = (obj.category || obj.discipline || obj.subcategory || null) as string | null;

    entries.push({
      title: (title as string).trim() || "Untitled",
      brand: typeof brand === "string" ? brand.trim() || null : null,
      agency: typeof agency === "string" ? agency.trim() || null : null,
      year,
      thumbnail_url: imgUrl ? upscaleImg(imgUrl) : null,
      source_url: sourceUrl as string,
      award_level: typeof awardLevel === "string" ? awardLevel.trim() || null : null,
      discipline: typeof discipline === "string" ? discipline.trim() || null : null,
    });
  }

  for (const val of Object.values(obj)) {
    entries.push(...collectEntries(val, year, depth + 1));
  }
  return entries;
}

function dedupeEntries(entries: DandadEntry[]): DandadEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = e.source_url + "|" + e.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function scrapeYear(year: number, send: (obj: unknown) => void): Promise<DandadEntry[]> {
  const url = `${DANDAD_BASE}/awards/professional/${year}/winners/`;
  send({ type: "progress", message: `Fetching D&AD ${year} winners page…` });

  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`D&AD page returned HTTP ${res.status}`);
  const html = await res.text();

  const nextDataMatch = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (nextDataMatch) {
    try {
      const json = JSON.parse(nextDataMatch[1]);
      const candidates = collectEntries(json, year);
      const deduped = dedupeEntries(candidates);
      if (deduped.length > 0) {
        send({ type: "progress", message: `Extracted ${deduped.length} entries from __NEXT_DATA__` });
        return deduped;
      }
    } catch {
      send({ type: "progress", message: "__NEXT_DATA__ parse failed — trying HTML fallback" });
    }
  }

  const entryLinks = new Set<string>();
  const linkRe = new RegExp(`href=["'](${DANDAD_BASE}/awards/professional/${year}/[^/"]+/[^"']+)["']`, "g");
  for (const m of html.matchAll(linkRe)) entryLinks.add(m[1]);
  const altLinkRe = new RegExp(`href=["'](/awards/professional/${year}/[^"']+)["']`, "g");
  for (const m of html.matchAll(altLinkRe)) entryLinks.add(`${DANDAD_BASE}${m[1]}`);

  if (entryLinks.size > 0) {
    send({ type: "progress", message: `Found ${entryLinks.size} entry links via HTML` });
    const entries: DandadEntry[] = [];
    for (const link of entryLinks) {
      const title = getMetaContent(html, "og:title") || link.split("/").filter(Boolean).pop() || "Untitled";
      const imgUrl = getMetaContent(html, "og:image") || null;
      entries.push({
        title,
        brand: null,
        agency: null,
        year,
        thumbnail_url: imgUrl ? upscaleImg(imgUrl) : null,
        source_url: link,
        award_level: null,
        discipline: null,
      });
    }
    return dedupeEntries(entries);
  }

  const title = getMetaContent(html, "og:title");
  const img = getMetaContent(html, "og:image");
  if (title) {
    return [{ title, brand: null, agency: null, year, thumbnail_url: img ? upscaleImg(img) : null, source_url: url, award_level: null, discipline: null }];
  }

  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));

      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const authHeader = req.headers.get("Authorization") || "";

        const userClient = createClient(supabaseUrl, serviceKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: userRes } = await userClient.auth.getUser();
        const user = userRes?.user;
        if (!user) { send({ type: "error", message: "Not authenticated" }); controller.close(); return; }

        const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (!isAdmin) { send({ type: "error", message: "Admin only" }); controller.close(); return; }

        const body = await req.json();
        const year: number = parseInt(body?.year ?? String(new Date().getFullYear()), 10) || new Date().getFullYear();
        const category: string | null = body?.category || null;

        const entries = await scrapeYear(year, send);

        const filtered = category
          ? entries.filter((e) => !e.discipline || e.discipline.toLowerCase().includes(category.toLowerCase()))
          : entries;

        if (filtered.length === 0) {
          send({ type: "error", message: "No entries found. The page structure may have changed — try again or scrape a specific entry URL via the main import tool." });
          controller.close();
          return;
        }

        send({ type: "progress", message: `Inserting ${filtered.length} entries into drafts…` });

        const admin = createClient(supabaseUrl, serviceKey);
        let inserted = 0;
        let skipped = 0;

        for (const entry of filtered) {
          const { data: existing } = await admin.from("references").select("id").eq("source_url", entry.source_url).maybeSingle();
          if (existing) { skipped++; continue; }

          const tags = ["d&ad"];
          if (entry.award_level) tags.push(entry.award_level.toLowerCase());
          if (entry.discipline) tags.push(entry.discipline.toLowerCase());

          const { error } = await admin.from("references").insert({
            title: entry.title,
            type: "image",
            source_url: entry.source_url,
            thumbnail_url: entry.thumbnail_url,
            media_url: entry.thumbnail_url,
            media_items: entry.thumbnail_url ? [{ url: entry.thumbnail_url, kind: "image" }] : [],
            brand: entry.brand,
            agency: entry.agency,
            year: entry.year,
            categories: [],
            tags,
            notes: [entry.award_level, entry.discipline].filter(Boolean).join(" — ") || null,
            created_by: user.id,
            published: false,
            source: "dandad",
          });

          if (error) {
            send({ type: "warn", message: `Skipped "${entry.title}": ${error.message}` });
          } else {
            inserted++;
            send({ type: "progress", message: `✓ ${entry.title}` });
          }
        }

        send({ type: "done", inserted, skipped, total: filtered.length });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
  });
});
