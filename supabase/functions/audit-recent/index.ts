// Audits recently-added references (default: last 3 days) and CORRECTS
// mistakes in title / brand / agency / year using Lovable AI.
//
// Unlike `generate-metadata` (which only fills BLANK fields), this function is
// allowed to OVERWRITE or CLEAR fields that are clearly wrong — e.g. a junk
// brand like "COTW" mistakenly applied to many entries, a generic placeholder
// title like "YouTube video", or a brand name redundantly prefixing the title.
//
// Streams NDJSON progress so the admin sees each correction live.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Bound the work per invocation so we stay under the edge-function wall-clock
// limit. The client paginates by passing `offset` and looping until the server
// reports no more entries to audit.
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 100;
const CONCURRENCY = 5;

const SYSTEM_PROMPT = `You are a meticulous fact-checker for an advertising & photography reference archive. You have deep knowledge of brands, agencies, photographers, directors, and notable campaigns.

You receive ONE reference's current fields (title, type, brand, agency, year, source_url, notes) PLUS, when available, a "page_context" block scraped from source_url containing the page title, meta description, and an AI summary of the page. Use page_context as PRIMARY evidence — it usually states the real brand, agency, campaign title, and year.

Each field gets an action:
- "keep"  → current value is correct, or you have no reliable evidence it is wrong.
- "set"   → current value is wrong/placeholder/missing AND you have strong evidence (from page_context, or unambiguous well-known campaign knowledge) of the correct value.
- "clear" → current value is wrong/junk and you have no reliable replacement (brand/agency/year only; title can never be cleared).

Be ASSERTIVE when page_context clearly states the answer — that is the whole reason it was scraped. Be CONSERVATIVE when there is no page_context and you would be guessing from the title alone.

Rules:
1. TITLE: If the title is a generic placeholder ("Video", "YouTube video", "Untitled", "Vimeo", a bare URL, the brand name alone, etc.) and page_context names the campaign/film, "set" the proper title. Strip a redundant brand prefix (e.g. brand "Nike" + title "Nike — Just Do It" → "Just Do It"). Never "set" an empty title.
2. BRAND: The advertiser/client (e.g. Nike, Apple, IKEA) — never an agency, never an awards site ("Cannes", "D&AD", "One Club", "COTW", "Adweek", "Campaign"), never a director/photographer name. If brand is clearly junk or wrong and page_context names the real brand, "set" it. If junk and no replacement is known, "clear".
3. AGENCY: The creative agency that made the work (e.g. Wieden+Kennedy, AMV BBDO, Mother). If page_context names it, "set" it. If the field holds the brand or an obvious mistake and no agency is known, "clear".
4. YEAR: A 4-digit integer between 1950 and the current year, matching the campaign's release year. If page_context gives a publish/award date, use it. Else "clear" if obviously wrong, otherwise "keep".
5. Provide a one-line "reason" naming WHICH evidence drove each change (e.g. "page_context says client is Nike, agency W+K, released 2023").

Return only the structured tool call.`;

const TOOL = {
  type: "function",
  function: {
    name: "emit_corrections",
    description: "Emit per-field corrections for a single reference.",
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
        reason: { type: "string" },
      },
      required: [
        "title_action",
        "brand_action",
        "agency_action",
        "year_action",
        "reason",
      ],
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

async function fetchPageContext(url: string | null, firecrawlKey: string | null): Promise<string | null> {
  if (!url || !firecrawlKey) return null;
  try {
    const resp = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["summary"],
        onlyMainContent: true,
        timeout: 15000,
      }),
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

async function auditOne(ref: RefRow, apiKey: string, firecrawlKey: string | null): Promise<Record<string, unknown> | null> {
  const pageContext = await fetchPageContext(ref.source_url, firecrawlKey);
  const userContext = [
    `title: ${ref.title}`,
    `type: ${ref.type || "(unknown)"}`,
    `brand: ${ref.brand ?? "(none)"}`,
    `agency: ${ref.agency ?? "(none)"}`,
    `year: ${ref.year ?? "(none)"}`,
    `source_url: ${ref.source_url ?? "(none)"}`,
    `notes: ${ref.notes ?? "(none)"}`,
    pageContext ? `\npage_context:\n${pageContext}` : `\npage_context: (unavailable)`,
  ].join("\n");

  const today = new Date();
  const currentYear = today.getUTCFullYear();
  const dateLine = `Today's date is ${today.toISOString().slice(0, 10)} (current year: ${currentYear}). Years up to and including ${currentYear} are NOT in the future.`;
  const strictRule = `\n\nCRITICAL EVIDENCE RULE: You may only use "set" for brand, agency, or year when the page_context block explicitly states that value. If page_context is unavailable, or does not name the brand/agency/year, you MUST "keep" (or "clear" only if the current value is obvious junk like "COTW", "Cannes", a URL, or the brand repeated as agency). Do NOT invent an agency from general knowledge — agency attributions guessed from a campaign name are frequently wrong. When in doubt, keep.`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: `${dateLine}\n\n${SYSTEM_PROMPT}${strictRule}` },
        { role: "user", content: userContext },
      ],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "emit_corrections" } },
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
    return JSON.parse(call.function.arguments);
  } catch {
    return null;
  }
}

// Build a DB update from AI corrections, skipping no-ops. Returns null if nothing
// meaningful changed.
function buildUpdate(ref: RefRow, c: Record<string, unknown>): Record<string, unknown> | null {
  const update: Record<string, unknown> = {};

  // Title — set only (never clear/empty)
  if (c.title_action === "set") {
    const v = typeof c.title_value === "string" ? c.title_value.trim() : "";
    if (v && v !== ref.title) update.title = v;
  }

  // Brand
  if (c.brand_action === "set") {
    const v = typeof c.brand_value === "string" ? c.brand_value.trim() : "";
    if (v && v !== ref.brand) update.brand = v;
  } else if (c.brand_action === "clear") {
    if (ref.brand) update.brand = null;
  }

  // Agency
  if (c.agency_action === "set") {
    const v = typeof c.agency_value === "string" ? c.agency_value.trim() : "";
    if (v && v !== ref.agency) update.agency = v;
  } else if (c.agency_action === "clear") {
    if (ref.agency) update.agency = null;
  }

  // Year
  if (c.year_action === "set") {
    const v = Number.isInteger(c.year_value) ? (c.year_value as number) : null;
    if (v && v >= 1950 && v <= new Date().getFullYear() && v !== ref.year) update.year = v;
  } else if (c.year_action === "clear") {
    if (ref.year != null) update.year = null;
  }

  return Object.keys(update).length > 0 ? update : null;
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

        // Single-reference mode: audit one entry by ID, bypass date filter
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
          send({ type: "progress", message: `Auditing "${singleRef.title}"…` });
          let fixed = 0;
          try {
            const corrections = await auditOne(singleRef as RefRow, apiKey, firecrawlKey);
            if (corrections) {
              const update = buildUpdate(singleRef as RefRow, corrections);
              if (update) {
                const { error: upErr } = await admin.from("references").update(update).eq("id", singleRef.id);
                if (upErr) {
                  send({ type: "warn", message: `Could not update "${singleRef.title}": ${upErr.message}` });
                } else {
                  fixed++;
                  const changes = Object.keys(update).map((k) => ({
                    field: k,
                    from: (singleRef as Record<string, unknown>)[k] ?? null,
                    to: update[k] ?? null,
                  }));
                  const summary = changes.map((c) => `${c.field}→${c.to === null ? "(cleared)" : c.to}`).join(", ");
                  send({
                    type: "fix",
                    refId: singleRef.id,
                    title: singleRef.title,
                    changes,
                    reason: corrections.reason ?? null,
                    message: `✓ ${singleRef.title}: ${summary}`,
                  });
                }
              }
            }
          } catch (e) {
            send({ type: "warn", message: `Skipped "${singleRef.title}": ${e instanceof Error ? e.message : String(e)}` });
          }
          send({ type: "done", checked: 1, fixed, total: 1, offset: 0, nextOffset: 1, hasMore: false, message: fixed > 0 ? `1 field(s) corrected.` : `No changes needed.` });
          controller.close(); return;
        }

        // Batch mode: audit entries added in the last N days
        const days = Math.min(Math.max(1, parseInt(body?.days ?? "3", 10) || 3), 30);
        const offset = Math.max(0, parseInt(body?.offset ?? "0", 10) || 0);
        const limit = Math.min(Math.max(1, parseInt(body?.limit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT), MAX_LIMIT);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        const { data: refs, error, count } = await admin
          .from("references")
          .select("id,title,type,brand,agency,year,source_url,notes", { count: "exact" })
          .eq("published", true)
          .gte("created_at", since)
          .is("audited_at", null)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) { send({ type: "error", message: error.message }); controller.close(); return; }
        const list = (refs as RefRow[]) || [];
        const total = count ?? list.length;

        if (list.length === 0) {
          send({ type: "done", checked: 0, fixed: 0, total, offset, message: offset === 0 ? `No entries added in the last ${days} day(s).` : `Reached end (${total} total).` });
          controller.close();
          return;
        }

        send({ type: "progress", message: `Auditing ${list.length} entries (${offset + 1}–${offset + list.length} of ${total})…` });


        let checked = 0;
        let fixed = 0;

        for (let i = 0; i < list.length; i += CONCURRENCY) {
          const chunk = list.slice(i, i + CONCURRENCY);
          await Promise.all(
            chunk.map(async (ref) => {
              const nowIso = new Date().toISOString();
              try {
                const corrections = await auditOne(ref, apiKey, firecrawlKey);
                checked++;
                const update = corrections ? buildUpdate(ref, corrections) : null;
                const finalUpdate: Record<string, unknown> = { ...(update || {}), audited_at: nowIso };
                const { error: upErr } = await admin.from("references").update(finalUpdate).eq("id", ref.id);
                if (upErr) {
                  send({ type: "warn", message: `Could not update "${ref.title}": ${upErr.message}` });
                  return;
                }
                if (!update) return;
                fixed++;
                const changes = Object.keys(update).map((k) => ({
                  field: k,
                  from: (ref as Record<string, unknown>)[k] ?? null,
                  to: update[k] ?? null,
                }));
                const summary = changes
                  .map((c) => `${c.field}→${c.to === null ? "(cleared)" : c.to}`)
                  .join(", ");
                send({
                  type: "fix",
                  refId: ref.id,
                  title: ref.title,
                  changes,
                  reason: corrections?.reason ?? null,
                  message: `✓ ${ref.title}: ${summary}`,
                });
              } catch (e) {
                send({ type: "warn", message: `Skipped "${ref.title}": ${e instanceof Error ? e.message : String(e)}` });
              }
            }),
          );
        }

        const nextOffset = offset + list.length;
        const hasMore = nextOffset < total;
        send({
          type: "done",
          checked,
          fixed,
          total,
          offset,
          nextOffset,
          hasMore,
          message: `Audited ${offset + 1}–${nextOffset} of ${total} — ${fixed} corrected${hasMore ? " (continuing…)" : "."}`,
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
