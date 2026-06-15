import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const ONECLUB_BASE = "https://www.oneclub.org";

type AwardType = "oneshow" | "adc";

interface OneclubEntry {
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
  const r =
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`).exec(html) ||
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`).exec(html);
  return r ? r[1] : null;
}

function collectEntries(node: unknown, year: number, depth = 0): OneclubEntry[] {
  if (depth > 20 || !node || typeof node !== "object") return [];
  if (Array.isArray(node)) {
    return node.flatMap((n) => collectEntries(n, year, depth + 1));
  }
  const obj = node as Record<string, unknown>;
  const entries: OneclubEntry[] = [];

  const hasTitle = typeof obj.title === "string" || typeof obj.name === "string" || typeof obj.entryTitle === "string";
  const hasImage =
    typeof obj.imageUrl === "string" ||
    typeof obj.thumbnail === "string" ||
    typeof obj.image === "string" ||
    typeof obj.thumbnailUrl === "string" ||
    typeof obj.coverImage === "string";

  if (hasTitle && hasImage) {
    const title = ((obj.title || obj.name || obj.entryTitle || "") as string).trim();
    const rawImg = (obj.imageUrl || obj.thumbnail || obj.image || obj.thumbnailUrl || obj.coverImage || "") as string;
    const imgUrl = rawImg.startsWith("http") ? rawImg : rawImg ? `${ONECLUB_BASE}${rawImg}` : null;
    const slugPart = [obj.slug, obj.path, obj.url, obj.permalink].find((v) => typeof v === "string");
    const sourceUrl = slugPart
      ? (slugPart as string).startsWith("http") ? slugPart as string : `${ONECLUB_BASE}${slugPart}`
      : ONECLUB_BASE;

    entries.push({
      title: title || "Untitled",
      brand: typeof obj.brand === "string" ? obj.brand.trim() || null : typeof obj.client === "string" ? obj.client.trim() || null : null,
      agency: typeof obj.agency === "string" ? obj.agency.trim() || null : typeof obj.entrant === "string" ? obj.entrant.trim() || null : null,
      year,
      thumbnail_url: imgUrl ? upscaleImg(imgUrl) : null,
      source_url: sourceUrl as string,
      award_level: typeof obj.award === "string" ? obj.award.trim() || null : typeof obj.awardLevel === "string" ? obj.awardLevel.trim() || null : null,
      discipline: typeof obj.category === "string" ? obj.category.trim() || null : typeof obj.discipline === "string" ? obj.discipline.trim() || null : null,
    });
  }

  for (const val of Object.values(obj)) {
    entries.push(...collectEntries(val, year, depth + 1));
  }
  return entries;
}

function dedupeEntries(entries: OneclubEntry[]): OneclubEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = e.source_url + "|" + e.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const AWARD_URLS: Record<AwardType, (year: number) => string> = {
  oneshow: (year) => `${ONECLUB_BASE}/awards/oneshowawards/-award/?year=${year}`,
  adc: (year) => `${ONECLUB_BASE}/awards/adcawards/-award/?year=${year}`,
};

async function scrapeAward(award: AwardType, year: number, send: (obj: unknown) => void): Promise<OneclubEntry[]> {
  const url = AWARD_URLS[award](year);
  const label = award === "oneshow" ? "One Show" : "ADC Annual Awards";
  send({ type: "progress", message: `Fetching ${label} ${year} winners…` });

  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Page returned HTTP ${res.status}`);
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
  const linkRe = /<a[^>]+href=["'](https:\/\/www\.oneclub\.org\/awards\/[^"']+)["']/g;
  for (const m of html.matchAll(linkRe)) entryLinks.add(m[1]);
  const relLinkRe = /<a[^>]+href=["'](\/awards\/[^"']+)["']/g;
  for (const m of html.matchAll(relLinkRe)) entryLinks.add(`${ONECLUB_BASE}${m[1]}`);

  if (entryLinks.size > 0) {
    send({ type: "progress", message: `Found ${entryLinks.size} entry links via HTML` });
    return dedupeEntries([...entryLinks].map((link) => ({
      title: link.split("/").filter(Boolean).pop()?.replace(/-/g, " ") || "Untitled",
      brand: null,
      agency: null,
      year,
      thumbnail_url: null,
      source_url: link,
      award_level: null,
      discipline: null,
    })));
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
        const award: AwardType = body?.award === "adc" ? "adc" : "oneshow";

        const entries = await scrapeAward(award, year, send);

        if (entries.length === 0) {
          send({ type: "error", message: "No entries found. The page structure may have changed — try importing specific entry URLs via the main import tool." });
          controller.close();
          return;
        }

        send({ type: "progress", message: `Inserting ${entries.length} entries into drafts…` });

        const admin = createClient(supabaseUrl, serviceKey);
        let inserted = 0;
        let skipped = 0;
        const awardTag = award === "oneshow" ? "one show" : "adc";

        for (const entry of entries) {
          const { data: existing } = await admin.from("references").select("id").eq("source_url", entry.source_url).maybeSingle();
          if (existing) { skipped++; continue; }

          const tags = [awardTag];
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
            source: award === "oneshow" ? "oneshow" : "adc",
          });

          if (error) {
            send({ type: "warn", message: `Skipped "${entry.title}": ${error.message}` });
          } else {
            inserted++;
            send({ type: "progress", message: `✓ ${entry.title}` });
          }
        }

        send({ type: "done", inserted, skipped, total: entries.length });
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
