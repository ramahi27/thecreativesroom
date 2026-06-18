// Combines backfill + audit into a single AI call per reference.
// Processes references that are either missing visual_summary OR were added
// in the last 3 days and not yet audited.
//
// One Gemini Pro call per reference:
//   - fact-checks / fixes title, brand, agency, year
//   - fills empty brand/agency/year when certain
//   - generates tags + tag_synonyms
//   - fills visual_summary and editing_style if empty
//
// Streams NDJSON progress so the admin sees each change live.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 100;
const CONCURRENCY = 4;

const SYSTEM_PROMPT = `You are a creative reference librarian and meticulous fact-checker for an advertising & photography reference archive. You have deep knowledge of brands, agencies, photographers, directors, and notable campaigns.

You receive ONE reference's current fields (title, type, brand, agency, year, source_url, notes, visual_summary, editing_style) PLUS, when available, a "page_context" block scraped from source_url. Use page_context as PRIMARY evidence — it usually states the real brand, agency, campaign title, and year.

Your combined tasks:

FACT-CHECK & FILL (title, brand, agency, year):
Each field gets an action:
- "keep"  → value is correct, or you have no reliable evidence it is wrong.
- "set"   → value is wrong/placeholder/missing AND you have strong evidence (page_context or unambiguous well-known campaign knowledge).
- "clear" → value is wrong/junk and you have no reliable replacement (brand/agency/year only; title can never be cleared).

Rules:
1. TITLE: Fix generic placeholders ("Video", "YouTube video", "Untitled", bare URL, brand name alone). If page_context names the campaign, use it. Strip redundant brand prefix. Never clear.
2. BRAND: The advertiser/client (e.g. Nike, Apple). Never an agency, never awards sites ("Cannes", "D&AD", "COTW", "Adweek"). Fix if wrong; fill if empty and 100% certain.
3. AGENCY: The creative agency (e.g. Wieden+Kennedy, AMV BBDO). Fix if wrong; fill if empty and 100% certain.
4. YEAR: 4-digit integer 1950–current year, matching the campaign's release year. Fix if wrong; fill if empty and certain.

GENERATE:
5. TAGS: 15–30 short lowercase tag phrases (1–3 words) covering themes, industry, style, tone, emotion, cultural context. No duplicates, no hashtags.
6. TAG SYNONYMS: 20–60 lowercase hidden search synonyms / alternatives / plurals for the tags. Not shown in UI.
7. VISUAL SUMMARY: Only if the provided visual_summary is empty — write 2–4 sentences describing the VISUAL and EMOTIONAL character: colour temperature and palette, lighting style, composition tendencies, mood and emotional register, casting. Primary signal for creative brief matching — be specific and evocative. Return null if visual_summary already has a value.
8. EDITING STYLE (video only): Only if the provided editing_style is empty — write 1–3 sentences on pacing, transitions, rhythm, structural devices. Return null if already has a value or type is not video.

Banned words for visual fields: "vibrant", "lively", "dynamic", "engaging", "captivating", "stunning", "powerful", "compelling", "showcases", "highlights".

Provide a one-line "reason" summarising the evidence behind any fact-check changes (or "no corrections needed" if all kept).

Return only the structured tool call.`;

const TOOL = {
  type: "function",
  function: {
    name: "process_reference",
    description: "Emit fact-check corrections and fill missing metadata for a single reference.",
    parameters: {
      type: "object",
      properties: {
        title_action: { type: "string", enum: ["keep", "set"] },
        title_value: { type: ["string", "null"] },
        brand_action: { type: "string", enum: ["keep", "set", "clear"] },
        brand_value: { type: ["string", "null"] },
        agency_action: { type: "string", enum: ["keep", "set", "clear"] },
        agency_value: { type: ["string", "null"] },
        year_action: { type: "string", enum: ["keep", "set", "clear"] },
        year_value: { type: ["integer", "null"] },
        tags: { type: "array", items: { type: "string" }, minItems: 15, maxItems: 30 },
        tag_synonyms: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 80 },
        visual_summary: { type: ["string", "null"] },
        editing_style: { type: ["string", "null"] },
        reason: { type: "string" },
      },
      required: ["title_action", "brand_action", "agency_action", "year_action", "tags", "reason"],
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
  visual_summary: string | null;
  editing_style: string | null;
  tags: string[] | null;
  tag_synonyms: string[] | null;
}

async function fetchPageContext(url: string | null, firecrawlKey: string | null): Promise<string | null> {
  if (!url || !firecrawlKey) return null;
  try {
    const resp = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["summary"], onlyMainContent: true, timeout: 15000 }),
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) return null;
    const json = await resp.json().catch(() => null);
    const d = json?.data ?? json;
    const meta = d?.metadata ?? {};
    const parts = [
      meta.title ? `page_title: ${String(meta.title).slice(0, 300)}` : null,
      meta.description ? `meta_description: ${String(meta.description).slice(0, 500)}` : null,
      meta.ogTitle && meta.ogTitle !== meta.title ? `og_title: ${String(meta.ogTitle).slice(0, 300)}` : null,
      d?.summary ? `page_summary: ${String(d.summary).slice(0, 1800)}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join("\n") : null;
  } catch {
    return null;
  }
}

async function processOne(ref: RefRow, apiKey: string, firecrawlKey: string | null): Promise<Record<string, unknown> | null> {
  const pageContext = await fetchPageContext(ref.source_url, firecrawlKey);
  const userContext = [
    `title: ${ref.title}`,
    `type: ${ref.type || "(unknown)"}`,
    `brand: ${ref.brand || "(missing — fill if 100% certain)"}`,
    `agency: ${ref.agency || "(missing — fill if 100% certain)"}`,
    `year: ${ref.year || "(missing — fill if 100% certain)"}`,
    `source_url: ${ref.source_url ?? "(none)"}`,
    `notes: ${ref.notes ?? "(none)"}`,
    `visual_summary: ${ref.visual_summary || "(empty — please fill)"}`,
    `editing_style: ${ref.editing_style || (ref.type === "video" ? "(empty — please fill)" : "(not applicable)")}`,
    pageContext ? `\npage_context:\n${pageContext}` : `\npage_context: (unavailable)`,
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
      tool_choice: { type: "function", function: { name: "process_reference" } },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`AI gateway ${resp.status}${t ? `: ${t.slice(0, 120)}` : ""}`);
  }
  const data = await resp.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) return null;
  try { return JSON.parse(call.function.arguments); } catch { return null; }
}

function buildUpdate(ref: RefRow, c: Record<string, unknown>): { update: Record<string, unknown>; changes: Array<{ field: string; from: unknown; to: unknown }> } {
  const update: Record<string, unknown> = {};
  const changes: Array<{ field: string; from: unknown; to: unknown }> = [];

  if (c.title_action === "set") {
    const v = typeof c.title_value === "string" ? c.title_value.trim() : "";
    if (v && v !== ref.title) { update.title = v; changes.push({ field: "title", from: ref.title, to: v }); }
  }

  if (c.brand_action === "set") {
    const v = typeof c.brand_value === "string" ? c.brand_value.trim() : "";
    if (v && v !== ref.brand) { update.brand = v; changes.push({ field: "brand", from: ref.brand, to: v }); }
  } else if (c.brand_action === "clear" && ref.brand) {
    update.brand = null; changes.push({ field: "brand", from: ref.brand, to: null });
  }

  if (c.agency_action === "set") {
    const v = typeof c.agency_value === "string" ? c.agency_value.trim() : "";
    if (v && v !== ref.agency) { update.agency = v; changes.push({ field: "agency", from: ref.agency, to: v }); }
  } else if (c.agency_action === "clear" && ref.agency) {
    update.agency = null; changes.push({ field: "agency", from: ref.agency, to: null });
  }

  if (c.year_action === "set") {
    const v = Number.isInteger(c.year_value) ? (c.year_value as number) : null;
    if (v && v >= 1950 && v <= new Date().getFullYear() && v !== ref.year) {
      update.year = v; changes.push({ field: "year", from: ref.year, to: v });
    }
  } else if (c.year_action === "clear" && ref.year != null) {
    update.year = null; changes.push({ field: "year", from: ref.year, to: null });
  }

  // Tags — merge, deduplicate
  if (Array.isArray(c.tags) && (c.tags as string[]).length > 0) {
    const existing = Array.isArray(ref.tags) ? ref.tags : [];
    const existingLower = new Set(existing.map((t: string) => t.toLowerCase()));
    const merged = [...existing, ...(c.tags as string[]).filter((t) => !existingLower.has(t.toLowerCase()))];
    update.tags = merged;
  }

  if (Array.isArray(c.tag_synonyms)) {
    const existing = Array.isArray(ref.tag_synonyms) ? ref.tag_synonyms : [];
    const existingLower = new Set(existing.map((t: string) => t.toLowerCase()));
    update.tag_synonyms = [...existing, ...(c.tag_synonyms as string[]).filter((t) => !existingLower.has(t.toLowerCase()))];
  }

  if (!ref.visual_summary && typeof c.visual_summary === "string" && c.visual_summary.trim()) {
    update.visual_summary = c.visual_summary.trim();
    changes.push({ field: "visual_summary", from: null, to: "(filled)" });
  }

  if (!ref.editing_style && ref.type === "video" && typeof c.editing_style === "string" && c.editing_style.trim()) {
    update.editing_style = c.editing_style.trim();
    changes.push({ field: "editing_style", from: null, to: "(filled)" });
  }

  return { update, changes };
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
        const apiKey = Deno.env.get("LOVABLE_API_KEY");
        const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") ?? null;
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

        const body = await req.json().catch(() => ({}));
        const singleId: string | null = typeof body?.id === "string" ? body.id : null;
        const admin = createClient(supabaseUrl, serviceKey);
        const nowIso = new Date().toISOString();

        const SELECT = "id,title,type,brand,agency,year,source_url,notes,visual_summary,editing_style,tags,tag_synonyms";

        // ── Single-reference mode ────────────────────────────────────────────────
        if (singleId) {
          const { data: ref, error: refErr } = await admin
            .from("references").select(SELECT).eq("id", singleId).eq("published", true).maybeSingle();
          if (refErr || !ref) {
            send({ type: "error", message: refErr?.message ?? "Reference not found" });
            controller.close(); return;
          }
          send({ type: "progress", message: `Processing "${ref.title}"…` });
          try {
            const result = await processOne(ref as RefRow, apiKey, firecrawlKey);
            if (result) {
              const { update, changes } = buildUpdate(ref as RefRow, result);
              const { error: upErr } = await admin.from("references").update({ ...update, audited_at: nowIso }).eq("id", ref.id);
              if (upErr) {
                send({ type: "warn", message: `Could not update "${ref.title}": ${upErr.message}` });
              } else if (changes.length > 0) {
                send({ type: "fix", refId: ref.id, title: ref.title, changes, reason: (result.reason as string) ?? null, message: `✓ ${ref.title}` });
              }
            } else {
              await admin.from("references").update({ audited_at: nowIso }).eq("id", ref.id);
            }
          } catch (e) {
            send({ type: "warn", message: `Skipped "${ref.title}": ${e instanceof Error ? e.message : String(e)}` });
          }
          send({ type: "done", checked: 1, fixed: 0, total: 1, hasMore: false, message: "Done." });
          controller.close(); return;
        }

        // ── Batch mode ───────────────────────────────────────────────────────────
        const offset = Math.max(0, parseInt(body?.offset ?? "0", 10) || 0);
        const limit = Math.min(Math.max(1, parseInt(body?.limit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT), MAX_LIMIT);
        const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

        const { data: refs, error, count } = await admin
          .from("references")
          .select(SELECT, { count: "exact" })
          .eq("published", true)
          .or(`visual_summary.is.null,and(created_at.gte.${since},audited_at.is.null)`)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) { send({ type: "error", message: error.message }); controller.close(); return; }
        const list = (refs as RefRow[]) || [];
        const total = count ?? list.length;

        if (list.length === 0) {
          send({ type: "done", checked: 0, fixed: 0, total, offset, hasMore: false, nextOffset: offset, message: offset === 0 ? "Nothing to process." : `Reached end (${total} total).` });
          controller.close(); return;
        }

        send({ type: "progress", message: `Processing ${list.length} references (${offset + 1}–${offset + list.length} of ${total})…` });

        let checked = 0;
        let fixed = 0;

        for (let i = 0; i < list.length; i += CONCURRENCY) {
          const chunk = list.slice(i, i + CONCURRENCY);
          await Promise.all(chunk.map(async (ref) => {
            try {
              const result = await processOne(ref, apiKey, firecrawlKey);
              checked++;
              if (!result) {
                await admin.from("references").update({ audited_at: nowIso }).eq("id", ref.id);
                return;
              }
              const { update, changes } = buildUpdate(ref, result);
              const { error: upErr } = await admin.from("references").update({ ...update, audited_at: nowIso }).eq("id", ref.id);
              if (upErr) {
                send({ type: "warn", message: `Could not update "${ref.title}": ${upErr.message}` });
                return;
              }
              if (changes.length === 0) return;
              fixed++;
              send({ type: "fix", refId: ref.id, title: ref.title, changes, reason: (result.reason as string) ?? null, message: `✓ ${ref.title}` });
            } catch (e) {
              send({ type: "warn", message: `Skipped "${ref.title}": ${e instanceof Error ? e.message : String(e)}` });
            }
          }));
        }

        const nextOffset = offset + list.length;
        const hasMore = nextOffset < total;
        send({ type: "done", checked, fixed, total, offset, nextOffset, hasMore, message: `Processed ${offset + 1}–${nextOffset} of ${total} — ${fixed} updated${hasMore ? " (continuing…)" : "."}` });
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
