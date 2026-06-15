import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal")) return true;
  if (h === "::1" || h === "[::1]") return true;
  if (h.startsWith("[fc") || h.startsWith("[fd") || h.startsWith("[fe80")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [parseInt(m[1]), parseInt(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
  }
  return false;
}

function getTagText(block: string, tag: string): string {
  const r = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`).exec(block);
  if (!r) return "";
  return r[1].replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
}

function getAttr(block: string, tagPattern: string, attr: string): string {
  const r = new RegExp(`<${tagPattern}[^>]+${attr}=["']([^"']+)["']`).exec(block);
  return r ? r[1] : "";
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImgFromHtml(html: string): string | null {
  const m = /<img[^>]+src=["']([^"']+)["']/.exec(html);
  return m ? m[1] : null;
}

interface FeedItem {
  title: string;
  source_url: string;
  thumbnail_url: string | null;
  notes: string | null;
  type: "image" | "video";
}

function parseRss(xml: string): FeedItem[] {
  const isAtom = xml.includes("<feed ") || xml.includes("<feed\n") || xml.includes('xmlns="http://www.w3.org/2005/Atom"');
  const itemTag = isAtom ? "entry" : "item";
  const itemRe = new RegExp(`<${itemTag}[\\s>]([\\s\\S]*?)<\\/${itemTag}>`, "g");
  const items = [...xml.matchAll(itemRe)];

  const results: FeedItem[] = [];
  for (const m of items) {
    const block = m[1];

    const title = stripHtml(getTagText(block, "title")) || "Untitled";

    let source_url = getTagText(block, "link");
    if (!source_url) source_url = getAttr(block, "link", "href");
    const altMatch = /<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/.exec(block) ||
                     /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']alternate["']/.exec(block);
    if (altMatch) source_url = altMatch[1];
    if (!source_url) continue;

    let thumbnail_url: string | null =
      getAttr(block, "media:content", "url") ||
      getAttr(block, "media:thumbnail", "url") ||
      getAttr(block, "enclosure", "url") ||
      null;

    if (!thumbnail_url) {
      const descHtml =
        getTagText(block, "content:encoded") ||
        getTagText(block, "description") ||
        getTagText(block, "content") ||
        getTagText(block, "summary");
      thumbnail_url = extractImgFromHtml(descHtml);
    }

    if (thumbnail_url) {
      thumbnail_url = thumbnail_url.replace(/[?&]w=\d+/, (m) => m.replace(/\d+/, "1200"));
    }

    const descRaw =
      getTagText(block, "description") ||
      getTagText(block, "summary") ||
      getTagText(block, "content");
    const notes = stripHtml(descRaw).slice(0, 200) || null;

    const mediaType = getAttr(block, "media:content", "type");
    const type: "image" | "video" = mediaType.startsWith("video/") ? "video" : "image";

    results.push({ title, source_url, thumbnail_url, notes, type });
  }
  return results;
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
        if (!user) {
          send({ type: "error", message: "Not authenticated" });
          controller.close();
          return;
        }
        const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (!isAdmin) {
          send({ type: "error", message: "Admin only" });
          controller.close();
          return;
        }

        const body = await req.json();
        const feedUrl: string = (body?.feedUrl || "").trim();
        const source: string = (body?.source || "rss").trim();
        const limit: number = Math.min(Math.max(1, parseInt(body?.limit ?? "50", 10)), 200);

        if (!feedUrl) {
          send({ type: "error", message: "feedUrl is required" });
          controller.close();
          return;
        }

        let parsed: URL;
        try { parsed = new URL(feedUrl); } catch {
          send({ type: "error", message: "Invalid URL" });
          controller.close();
          return;
        }
        if (!["http:", "https:"].includes(parsed.protocol)) {
          send({ type: "error", message: "Only http/https URLs allowed" });
          controller.close();
          return;
        }
        if (isBlockedHost(parsed.hostname)) {
          send({ type: "error", message: "Host not allowed" });
          controller.close();
          return;
        }

        send({ type: "progress", message: `Fetching: ${feedUrl}` });

        const res = await fetch(feedUrl, {
          headers: {
            "User-Agent": UA,
            Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
          },
        });
        if (!res.ok) {
          send({ type: "error", message: `Feed returned HTTP ${res.status}` });
          controller.close();
          return;
        }
        const xml = await res.text();
        const items = parseRss(xml).slice(0, limit);

        if (items.length === 0) {
          send({ type: "error", message: "No items found in feed — it may use a non-standard format" });
          controller.close();
          return;
        }

        send({ type: "progress", message: `Found ${items.length} items — checking for duplicates…` });

        const admin = createClient(supabaseUrl, serviceKey);
        let inserted = 0;
        let skipped = 0;

        for (const item of items) {
          const { data: existing } = await admin
            .from("references")
            .select("id")
            .eq("source_url", item.source_url)
            .maybeSingle();
          if (existing) { skipped++; continue; }

          const { error } = await admin.from("references").insert({
            title: item.title,
            type: item.type,
            source_url: item.source_url,
            thumbnail_url: item.thumbnail_url,
            media_url: item.thumbnail_url,
            media_items: item.thumbnail_url ? [{ url: item.thumbnail_url, kind: "image" }] : [],
            brand: null,
            agency: null,
            year: null,
            categories: [],
            tags: [source],
            notes: item.notes,
            created_by: user.id,
            published: false,
            source,
          });

          if (error) {
            send({ type: "warn", message: `Skipped "${item.title}": ${error.message}` });
          } else {
            inserted++;
            send({ type: "progress", message: `✓ ${item.title}` });
          }
        }

        send({ type: "done", inserted, skipped, total: items.length });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
});
