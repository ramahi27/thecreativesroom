// Web-grounded enrichment of `concept_summary` for references.
//
// Mirrors enrich-visual's evidence pipeline, but instead of describing the
// VISUAL character it explains the CREATIVE IDEA and STRATEGY behind the work.
//
// Per reference:
//   1. Platform-aware evidence gathering:
//      - YouTube: YouTube Data API v3 (full description + hashtags/tags).
//                 Falls back to oEmbed (title + channel) if no YOUTUBE_API_KEY.
//      - Vimeo:   Vimeo oEmbed (title + description + author) + Firecrawl scrape.
//      - Other:   Firecrawl scrape (markdown + AI summary).
//   2. Web search — targeted toward case studies / strategy / award write-ups,
//      where the "big idea", insight and results are actually documented.
//   3. All evidence sent to Gemini 2.5 Pro → grounded concept_summary.
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

const SYSTEM_PROMPT = `You are a brand strategist and creative director writing evidence-grounded CASE-STUDY summaries for a creative reference library. Other strategists read these to understand the THINKING behind famous work, so they MUST be specific and insight-led — generic descriptions are worse than nothing.

You receive ONE reference's basic fields PLUS an "evidence" block which may include:
- page_context / platform metadata: scraped or API-fetched content from the source URL (YouTube description, Vimeo description, page markdown, AI summary, hashtags, credits)
- search_results: snippets from a web search for the campaign (case studies, strategy write-ups, awards juries, press)

Your job: produce a concrete concept_summary explaining the CREATIVE IDEA and STRATEGY — NOT the visuals — grounded in the evidence.

Cover, in 3-5 sentences:
- The big idea: the single creative thought the work is built on.
- The insight: the consumer truth or cultural tension it taps into.
- The strategic problem: what business/brand problem it set out to solve.
- The mechanism: how the execution actually delivers the idea (and results, if documented).

HARD RULES — non-negotiable:

1. BAN generic marketing filler. If you catch yourself writing one, rewrite with a concrete, evidenced point instead:
   - "captures the essence of", "resonates with audiences", "creates an emotional connection"
   - "powerful", "compelling", "engaging", "impactful", "memorable", "iconic" as filler adjectives
   - "showcases the brand", "highlights the product", "tells a story" with no specifics
   - vague "raises awareness" / "drives engagement" with no stated mechanism

2. PREFER concrete, evidenced points:
   - Name the actual insight ("most people can't name a single female engineer", "men skip skincare because the category feels feminine").
   - Name the strategic move ("reframed a price cut as a loyalty reward", "turned a product flaw into the hero").
   - Name documented results when present (sales lift, earned reach, awards), drawn from the evidence.
   - Credits, hashtags, taglines and case-study language from the evidence are gold — mine them.

3. EVIDENCE THRESHOLD. If the evidence is too thin to state a real idea/insight (only the title and brand, no source content, no useful search results), return null. Do NOT fall back to a generic training-data guess. A null is better than filler.

4. LENGTH: 3-5 sentences, max ~700 chars. No bullet points, no markdown, no "according to...".

Return only the structured tool call.`;

const TOOL = {
  type: "function",
  function: {
    name: "emit_concept_metadata",
    description: "Emit a grounded concept_summary, or null when evidence is too thin.",
    parameters: {
      type: "object",
      properties: {
        concept_summary: {
          type: ["string", "null"],
          description: "3-5 sentences on the creative idea, insight, strategic problem and mechanism. Evidence-grounded, no filler. Null if evidence is too thin.",
        },
        evidence_strength: {
          type: "string",
          enum: ["strong", "weak", "none"],
          description: "How confident the summary is in the evidence: strong = real case-study/search content; weak = thin signals; none = no usable evidence.",
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

// ── Web search — Google Custom Search API (Firecrawl fallback) ──────────────
// Query is biased toward strategy/case-study coverage where the idea, insight
// and results are documented.

async function fetchSearchSnippets(
  ref: RefRow,
  firecrawlKey: string | null,
  googleKey: string | null,
  googleCx: string | null,
): Promise<string | null> {
  const base = [ref.title, ref.brand, ref.year ? String(ref.year) : null].filter(Boolean).join(" ");
  if (!base.trim()) return null;

  const query = `${base} campaign "case study" OR strategy OR insight OR "the idea" OR results OR effectiveness`;

  if (googleKey && googleCx) {
    try {
      const url = new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("key", googleKey);
      url.searchParams.set("cx", googleCx);
      url.searchParams.set("q", query);
      url.searchParams.set("num", "8");

      const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
      if (resp.ok) {
        const json = await resp.json().catch(() => null);
        const items: Record<string, unknown>[] = Array.isArray(json?.items) ? json.items : [];
        const lines = items.slice(0, 8).map((r, i) => {
          const t = typeof r.title === "string" ? r.title.slice(0, 200) : "";
          const u = typeof r.link === "string" ? r.link : "";
          const snippet = typeof r.snippet === "string" ? r.snippet.slice(0, 400) : "";
          const meta = (r.pagemap as any)?.metatags?.[0];
          const ogDesc = typeof meta?.["og:description"] === "string"
            ? meta["og:description"].slice(0, 400) : "";
          const body = ogDesc && ogDesc !== snippet ? `${snippet}\n    ${ogDesc}` : snippet;
          return `[${i + 1}] ${t}\n    ${u}\n    ${body}`;
        });
        if (lines.length > 0) return lines.join("\n");
      }
    } catch { /* fall through to Firecrawl */ }
  }

  if (!firecrawlKey) return null;
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
  googleKey: string | null,
  googleCx: string | null,
): Promise<{ concept_summary: string | null; evidence_strength: string } | null> {
  const url = ref.source_url;

  const [pageContext, searchSnippets] = await Promise.all([
    isYouTubeUrl(url)
      ? fetchYouTubeMetadata(url!, ytKey)
      : isVimeoUrl(url)
        ? Promise.all([fetchVimeoMetadata(url!), fetchPageContext(url, firecrawlKey)])
            .then(([v, f]) => [v, f].filter(Boolean).join("\n\n") || null)
        : fetchPageContext(url, firecrawlKey),
    fetchSearchSnippets(ref, firecrawlKey, googleKey, googleCx),
  ]);

  if (!pageContext && !searchSnippets) {
    return { concept_summary: null, evidence_strength: "none" };
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
      tool_choice: { type: "function", function: { name: "emit_concept_metadata" } },
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
    const cs = typeof parsed.concept_summary === "string" ? parsed.concept_summary.trim() : null;
    const strength = typeof parsed.evidence_strength === "string" ? parsed.evidence_strength : "none";
    return {
      concept_summary: cs && cs.length > 0 ? cs : null,
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
        const googleKey = Deno.env.get("GOOGLE_CSE_KEY") ?? null;
        const googleCx = Deno.env.get("GOOGLE_CSE_CX") ?? null;
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
        if (!googleKey || !googleCx) send({ type: "warn", message: "GOOGLE_CSE_KEY / GOOGLE_CSE_CX not configured — falling back to Firecrawl search." });
        if (!firecrawlKey && (!googleKey || !googleCx)) send({ type: "warn", message: "No search API configured — web search disabled." });

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
          send({ type: "progress", message: `Researching "${singleRef.title}"…` });
          try {
            const result = await enrichOne(singleRef as RefRow, apiKey, firecrawlKey, ytKey, googleKey, googleCx);
            const nowIso = new Date().toISOString();
            if (!result?.concept_summary) {
              send({ type: "skip", refId: singleRef.id, title: singleRef.title, strength: result?.evidence_strength ?? "none", message: `— ${singleRef.title}: evidence too thin, nothing written.` });
            } else {
              const { error: upErr } = await admin
                .from("references")
                .update({ concept_summary: result.concept_summary, concept_generated_at: nowIso })
                .eq("id", singleRef.id);
              if (upErr) {
                send({ type: "warn", message: `Could not update "${singleRef.title}": ${upErr.message}` });
              } else {
                send({
                  type: "fix",
                  refId: singleRef.id,
                  title: singleRef.title,
                  changes: [{ field: "concept_summary", to: result.concept_summary }],
                  strength: result?.evidence_strength ?? "none",
                  message: `✓ ${singleRef.title} (${result?.evidence_strength}): concept_summary`,
                });
              }
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
        if (!force) query = query.is("concept_generated_at", null);

        const { data: refs, error, count } = await query;
        if (error) { send({ type: "error", message: error.message }); controller.close(); return; }
        const list = (refs as RefRow[]) || [];
        const total = count ?? list.length;

        if (list.length === 0) {
          send({ type: "done", checked: 0, fixed: 0, total, offset, listSize: 0, hasMore: false, message: force ? `No entries at offset ${offset}.` : `All entries already have a concept summary (${total}).` });
          controller.close(); return;
        }

        send({ type: "progress", message: `Researching ${list.length} entries (${offset + 1}–${offset + list.length} of ${total})…` });

        let checked = 0;
        let fixed = 0;

        for (let i = 0; i < list.length; i += CONCURRENCY) {
          const chunk = list.slice(i, i + CONCURRENCY);
          await Promise.all(
            chunk.map(async (ref) => {
              const nowIso = new Date().toISOString();
              try {
                const result = await enrichOne(ref, apiKey, firecrawlKey, ytKey, googleKey, googleCx);
                checked++;
                if (!result?.concept_summary) {
                  // Evidence too thin — do NOT stamp concept_generated_at so the ref
                  // is retried when better evidence becomes available.
                  send({ type: "skip", refId: ref.id, title: ref.title, strength: result?.evidence_strength ?? "none", message: `— ${ref.title}: evidence too thin.` });
                  return;
                }
                const { error: upErr } = await admin
                  .from("references")
                  .update({ concept_summary: result.concept_summary, concept_generated_at: nowIso })
                  .eq("id", ref.id);
                if (upErr) {
                  send({ type: "warn", message: `Could not update "${ref.title}": ${upErr.message}` });
                  return;
                }
                fixed++;
                send({
                  type: "fix",
                  refId: ref.id,
                  title: ref.title,
                  changes: [{ field: "concept_summary", to: result.concept_summary }],
                  strength: result?.evidence_strength ?? "none",
                  message: `✓ ${ref.title} (${result?.evidence_strength}): concept_summary`,
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
          listSize: list.length,
          message: `Researched ${fixed}/${checked} (${total - list.length} remaining)${hasMore ? " — continuing…" : "."}`,
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
