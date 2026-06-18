// Web-grounded enrichment of `visual_summary` and `editing_style` for references.
//
// Per reference:
//   1. Platform-aware evidence gathering:
//      - YouTube: YouTube Data API v3 (full description + hashtags/tags).
//                 Falls back to oEmbed (title + channel) if no YOUTUBE_API_KEY.
//                 Skips Firecrawl scrape (it returns nothing useful for YT pages).
//      - Vimeo:   Vimeo oEmbed (title + description + author) + Firecrawl scrape in parallel.
//      - Other:   Firecrawl scrape (markdown + AI summary).
//   2. Firecrawl web search — targeted toward press/award/case-study coverage.
//   3. All evidence sent to Gemini 2.5 Pro → grounded visual_summary + editing_style.
//      Generic filler forbidden. Returns null if evidence too thin.
//
// Streams NDJSON progress (progress | fix | skip | warn | done).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const CONCURRENCY = 4;

const SYSTEM_PROMPT = `You are a senior creative director writing evidence-grounded visual descriptions for a creative reference library. Other people use these descriptions to find references for new briefs, so they MUST be specific and discriminating — generic descriptions are worse than no description.

You receive ONE reference's basic fields PLUS an "evidence" block which may include:
- page_context / platform metadata: scraped or API-fetched content from the source URL (YouTube description, Vimeo description, page markdown, AI summary, hashtags, credits)
- search_results: snippets from a web search for the campaign (press, awards, case studies, making-ofs)

Your job: produce a concrete, specific visual_summary and (for videos only) editing_style, grounded in the evidence.

HARD RULES — these are non-negotiable:

1. BAN these generic words/phrases. If you catch yourself writing one, rewrite the sentence with concrete observed detail instead:
   - "vibrant", "lively", "dynamic", "engaging", "captivating", "stunning"
   - "bright and clean", "warm and inviting", "cool and modern"
   - "fast-paced", "quick cuts" (use specific cut-frequency observations like "cuts every 0.5-1s, sync to beat" instead)
   - "emotional", "powerful", "compelling", "striking"
   - "showcases", "highlights", "emphasizes" as filler verbs

2. PREFER concrete observations:
   - Named directors / DPs / editors / studios when found in evidence
   - Specific colour names ("teal-and-orange grade", "bleached neutrals", "neon magenta and chartreuse") not "vibrant palette"
   - Named lighting devices ("overhead practicals", "ring light", "single-source key", "available daylight through sheers")
   - Named editing devices ("L-cuts", "whip pans", "match cuts on motion", "single oner", "split-screen quad", "freeze-frame punch-ins")
   - Specific framing ("anamorphic 2.39, low-angle dolly", "locked-off symmetrical wides", "handheld mid-shots")
   - Credits, hashtags, and production notes from YouTube/Vimeo descriptions are gold — mine them for director, DP, agency, style cues

3. EVIDENCE THRESHOLD. If the evidence is too thin to write something specific (e.g. no source content, no useful search results, only the title and brand), return null for that field. Do NOT fall back to your training-data guess. A null field is better than a generic one.

4. LENGTH: visual_summary 2-4 sentences, max ~500 chars. editing_style 1-3 sentences, max ~280 chars. No bullet points, no markdown.

5. editing_style is for type="video" ONLY. Return null for type="image".

6. Cite evidence implicitly through specifics, not explicitly ("according to..." is banned). The reader doesn't need to see the receipts — they need to see the observation.

Return only the structured tool call.`;

const TOOL = {
  type: "function",
  function: {
    name: "emit_visual_metadata",
    description: "Emit grounded visual_summary and editing_style, or null when evidence is too thin.",
    parameters: {
      type: "object",
      properties: {
        visual_summary: {
          type: ["string", "null"],
          description: "2-4 sentences, evidence-grounded, no banned filler. Null if evidence is too thin.",
        },
        editing_style: {
          type: ["string", "null"],
          description: "Video only. 1-3 sentences, evidence-grounded, no banned filler. Null for images or if evidence is thin.",
        },
        evidence_strength: {
          type: "string",
          enum: ["strong", "weak", "none"],
          description: "How confident the description is in the evidence: strong = real page/search content; weak = thin signals; none = no usable evidence.",
        },
      },
      required: ["evidence_strength"],
      additionalProperties: false,
    },
  },
};

interface RefRow {
  id: string;
  title: string;
  type: string | null;
  brand: string | null;
  agency: string | null;
  year: number | null;
  source_url: string | null;
  notes: string | null;
}

// ── Platform detection ──────────────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0] || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
      return u.searchParams.get("v");
    }
    return null;
  } catch { return null; }
}

function isYouTubeUrl(url: string | null): boolean {
  return !!url && /youtube\.com|youtu\.be/.test(url);
}

function isVimeoUrl(url: string | null): boolean {
  return !!url && /vimeo\.com/.test(url);
}

// ── Platform-specific evidence fetchers ────────────────────────────────────

async function fetchYouTubeMetadata(url: string, ytKey: string | null): Promise<string | null> {
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;

  // YouTube Data API v3 — full description + tags + hashtags
  if (ytKey) {
    try {
      const resp = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?id=${encodeURIComponent(videoId)}&part=snippet&key=${ytKey}`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (resp.ok) {
        const json = await resp.json();
        const snippet = json?.items?.[0]?.snippet;
        if (snippet) {
          const desc = typeof snippet.description === "string" ? snippet.description : "";
          // Extract #hashtags from description (YouTube shows them above the title)
          const hashtags = [...desc.matchAll(/#(\w+)/g)].map((m) => `#${m[1]}`).slice(0, 25);
          const parts = [
            snippet.title ? `yt_title: ${snippet.title}` : null,
            snippet.channelTitle ? `yt_channel: ${snippet.channelTitle}` : null,
            desc ? `yt_description:\n${desc.slice(0, 2500)}` : null,
            Array.isArray(snippet.tags) && snippet.tags.length
              ? `yt_tags: ${snippet.tags.slice(0, 30).join(", ")}` : null,
            hashtags.length ? `yt_hashtags: ${hashtags.join(" ")}` : null,
          ].filter(Boolean);
          if (parts.length > 0) return parts.join("\n");
        }
      }
    } catch { /* fall through to oEmbed */ }
  }

  // oEmbed fallback — title + channel only, no description
  try {
    const resp = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (resp.ok) {
      const json = await resp.json();
      const parts = [
        json.title ? `yt_title: ${json.title}` : null,
        json.author_name ? `yt_channel: ${json.author_name}` : null,
      ].filter(Boolean);
      if (parts.length > 0) return parts.join("\n");
    }
  } catch { /* ignore */ }

  return null;
}

async function fetchVimeoMetadata(url: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!resp.ok) return null;
    const json = await resp.json();
    const parts = [
      json.title ? `vimeo_title: ${json.title}` : null,
      json.author_name ? `vimeo_author: ${json.author_name}` : null,
      typeof json.description === "string" && json.description
        ? `vimeo_description:\n${json.description.slice(0, 2000)}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join("\n") : null;
  } catch { return null; }
}

async function fetchPageContext(url: string | null, firecrawlKey: string | null): Promise<string | null> {
  if (!url || !firecrawlKey) return null;
  try {
    const resp = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["summary", "markdown"],
        onlyMainContent: true,
        timeout: 15000,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) return null;
    const json = await resp.json().catch(() => null);
    const d = json?.data ?? json;
    const meta = d?.metadata ?? {};
    const md = typeof d?.markdown === "string" ? d.markdown.slice(0, 3000) : null;
    const parts = [
      meta.title ? `page_title: ${String(meta.title).slice(0, 300)}` : null,
      meta.description ? `meta_description: ${String(meta.description).slice(0, 500)}` : null,
      meta.ogTitle && meta.ogTitle !== meta.title ? `og_title: ${String(meta.ogTitle).slice(0, 300)}` : null,
      d?.summary ? `page_summary: ${String(d.summary).slice(0, 1800)}` : null,
      md ? `page_markdown_excerpt:\n${md}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join("\n") : null;
  } catch { return null; }
}

// ── Web search — biased toward press / award / case-study sources ───────────

async function fetchSearchSnippets(ref: RefRow, firecrawlKey: string | null): Promise<string | null> {
  if (!firecrawlKey) return null;
  const base = [ref.title, ref.brand, ref.year ? String(ref.year) : null].filter(Boolean).join(" ");
  if (!base.trim()) return null;

  // Separate queries for video vs image — target different press vocabulary
  const query = ref.type === "video"
    ? `${base} ad commercial director agency making-of case study award`
    : `${base} campaign photographer art director lookbook case study`;

  try {
    const resp = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: 6 }),
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) return null;
    const json = await resp.json().catch(() => null);
    const arr = Array.isArray(json?.data) ? json.data : (Array.isArray(json?.web) ? json.web : []);
    const lines = arr.slice(0, 6).map((r: Record<string, unknown>, i: number) => {
      const t = typeof r.title === "string" ? r.title.slice(0, 200) : "";
      const u = typeof r.url === "string" ? r.url : "";
      const d = typeof r.description === "string" ? r.description.slice(0, 400) : "";
      return `[${i + 1}] ${t}\n    ${u}\n    ${d}`;
    });
    return lines.length > 0 ? lines.join("\n") : null;
  } catch { return null; }
}

// ── Core enrichment call ────────────────────────────────────────────────────

async function enrichOne(
  ref: RefRow,
  apiKey: string,
  firecrawlKey: string | null,
  ytKey: string | null,
): Promise<{ visual_summary: string | null; editing_style: string | null; evidence_strength: string } | null> {
  const url = ref.source_url;

  // Fetch page evidence and web search snippets in parallel.
  // Platform routing: YT uses API (not Firecrawl), Vimeo uses oEmbed + Firecrawl, others use Firecrawl.
  const [pageContext, searchSnippets] = await Promise.all([
    isYouTubeUrl(url)
      ? fetchYouTubeMetadata(url!, ytKey)
      : isVimeoUrl(url)
        ? Promise.all([fetchVimeoMetadata(url!), fetchPageContext(url, firecrawlKey)])
            .then(([v, f]) => [v, f].filter(Boolean).join("\n\n") || null)
        : fetchPageContext(url, firecrawlKey),
    fetchSearchSnippets(ref, firecrawlKey),
  ]);

  if (!pageContext && !searchSnippets) {
    return { visual_summary: null, editing_style: null, evidence_strength: "none" };
  }

  const userContext = [
    `title: ${ref.title}`,
    `type: ${ref.type || "(unknown)"}`,
    `brand: ${ref.brand ?? "(none)"}`,
    `agency: ${ref.agency ?? "(none)"}`,
    `year: ${ref.year ?? "(none)"}`,
    `source_url: ${url ?? "(none)"}`,
    `notes: ${ref.notes ?? "(none)"}`,
    "",
    "evidence:",
    pageContext ? `page_context:\n${pageContext}` : "page_context: (unavailable)",
    "",
    searchSnippets ? `search_results:\n${searchSnippets}` : "search_results: (none)",
  ].join("\n");

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContext },
      ],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "emit_visual_metadata" } },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`AI gateway ${resp.status}${t ? `: ${t.slice(0, 120)}` : ""}`);
  }

  const data = await resp.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) return null;
  try {
    const parsed = JSON.parse(call.function.arguments) as Record<string, unknown>;
    const vs = typeof parsed.visual_summary === "string" ? parsed.visual_summary.trim() : null;
    const es = typeof parsed.editing_style === "string" ? parsed.editing_style.trim() : null;
    const strength = typeof parsed.evidence_strength === "string" ? parsed.evidence_strength : "none";
    return {
      visual_summary: vs && vs.length > 0 ? vs : null,
      editing_style: es && es.length > 0 ? es : null,
      evidence_strength: strength,
    };
  } catch { return null; }
}

// ── Edge function handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));

      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const apiKey = Deno.env.get("LOVABLE_API_KEY");
        const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") ?? null;
        const ytKey = Deno.env.get("YOUTUBE_API_KEY") ?? null;
        const authHeader = req.headers.get("Authorization") || "";

        const userClient = createClient(supabaseUrl, serviceKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: userRes } = await userClient.auth.getUser();
        const user = userRes?.user;
        if (!user) { send({ type: "error", message: "Not authenticated" }); controller.close(); return; }

        const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (!isAdmin) { send({ type: "error", message: "Admin only" }); controller.close(); return; }
        if (!apiKey) { send({ type: "error", message: "LOVABLE_API_KEY not configured" }); controller.close(); return; }
        if (!firecrawlKey) send({ type: "warn", message: "FIRECRAWL_API_KEY not configured — web search disabled." });
        if (!ytKey) send({ type: "warn", message: "YOUTUBE_API_KEY not configured — YouTube videos will use oEmbed only (no description or hashtags)." });

        const body = await req.json().catch(() => ({}));
        const singleId: string | null = typeof body?.id === "string" ? body.id : null;
        const force: boolean = body?.force === true;

        const admin = createClient(supabaseUrl, serviceKey);

        // ── Single-row mode ─────────────────────────────────────────────────
        if (singleId) {
          const { data: singleRef, error: singleErr } = await admin
            .from("references")
            .select("id,title,type,brand,agency,year,source_url,notes")
            .eq("id", singleId)
            .eq("published", true)
            .maybeSingle();
          if (singleErr || !singleRef) {
            send({ type: "error", message: singleErr?.message ?? "Reference not found" });
            controller.close(); return;
          }
          send({ type: "progress", message: `Enriching "${singleRef.title}"…` });
          try {
            const result = await enrichOne(singleRef as RefRow, apiKey, firecrawlKey, ytKey);
            const nowIso = new Date().toISOString();
            const update: Record<string, unknown> = { visual_enriched_at: nowIso };
            const changes: { field: string; to: string | null }[] = [];
            if (result?.visual_summary) {
              update.visual_summary = result.visual_summary;
              changes.push({ field: "visual_summary", to: result.visual_summary });
            }
            if (result?.editing_style && (singleRef as RefRow).type === "video") {
              update.editing_style = result.editing_style;
              changes.push({ field: "editing_style", to: result.editing_style });
            }
            const { error: upErr } = await admin.from("references").update(update).eq("id", singleRef.id);
            if (upErr) {
              send({ type: "warn", message: `Could not update "${singleRef.title}": ${upErr.message}` });
            } else {
              send({
                type: "fix",
                refId: singleRef.id,
                title: singleRef.title,
                changes,
                strength: result?.evidence_strength ?? "none",
                message: changes.length > 0
                  ? `✓ ${singleRef.title} (${result?.evidence_strength}): ${changes.map((c) => c.field).join(", ")}`
                  : `— ${singleRef.title}: evidence too thin, nothing written.`,
              });
            }
          } catch (e) {
            send({ type: "warn", message: `Skipped "${singleRef.title}": ${e instanceof Error ? e.message : String(e)}` });
          }
          send({ type: "done", checked: 1, fixed: 0, total: 1, offset: 0, nextOffset: 1, hasMore: false, message: "Done." });
          controller.close(); return;
        }

        // ── Batch mode ──────────────────────────────────────────────────────
        const offset = Math.max(0, parseInt(body?.offset ?? "0", 10) || 0);
        const limit = Math.min(Math.max(1, parseInt(body?.limit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT), MAX_LIMIT);

        let query = admin
          .from("references")
          .select("id,title,type,brand,agency,year,source_url,notes", { count: "exact" })
          .eq("published", true)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (!force) query = query.is("visual_enriched_at", null);

        const { data: refs, error, count } = await query;
        if (error) { send({ type: "error", message: error.message }); controller.close(); return; }
        const list = (refs as RefRow[]) || [];
        const total = count ?? list.length;

        if (list.length === 0) {
          send({ type: "done", checked: 0, fixed: 0, total, offset, message: force ? `No entries at offset ${offset}.` : `All entries already enriched (${total}).` });
          controller.close(); return;
        }

        send({ type: "progress", message: `Enriching ${list.length} entries (${offset + 1}–${offset + list.length} of ${total})…` });

        let checked = 0;
        let fixed = 0;

        for (let i = 0; i < list.length; i += CONCURRENCY) {
          const chunk = list.slice(i, i + CONCURRENCY);
          await Promise.all(
            chunk.map(async (ref) => {
              const nowIso = new Date().toISOString();
              try {
                const result = await enrichOne(ref, apiKey, firecrawlKey, ytKey);
                checked++;
                const update: Record<string, unknown> = { visual_enriched_at: nowIso };
                const changes: { field: string; to: string | null }[] = [];
                if (result?.visual_summary) {
                  update.visual_summary = result.visual_summary;
                  changes.push({ field: "visual_summary", to: result.visual_summary });
                }
                if (result?.editing_style && ref.type === "video") {
                  update.editing_style = result.editing_style;
                  changes.push({ field: "editing_style", to: result.editing_style });
                }
                const { error: upErr } = await admin.from("references").update(update).eq("id", ref.id);
                if (upErr) {
                  send({ type: "warn", message: `Could not update "${ref.title}": ${upErr.message}` });
                  return;
                }
                if (changes.length === 0) {
                  send({ type: "skip", refId: ref.id, title: ref.title, strength: result?.evidence_strength ?? "none", message: `— ${ref.title}: evidence too thin.` });
                  return;
                }
                fixed++;
                send({
                  type: "fix",
                  refId: ref.id,
                  title: ref.title,
                  changes,
                  strength: result?.evidence_strength ?? "none",
                  message: `✓ ${ref.title} (${result?.evidence_strength}): ${changes.map((c) => c.field).join(", ")}`,
                });
              } catch (e) {
                send({ type: "warn", message: `Skipped "${ref.title}": ${e instanceof Error ? e.message : String(e)}` });
              }
            }),
          );
        }

        const nextOffset = force ? offset + list.length : offset;
        const hasMore = force ? nextOffset < total : (total - list.length) > 0;
        send({
          type: "done",
          checked,
          fixed,
          total,
          offset,
          nextOffset,
          hasMore,
          message: `Enriched ${fixed}/${checked} (${total - list.length} remaining)${hasMore ? " — continuing…" : "."}`,
        });
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
