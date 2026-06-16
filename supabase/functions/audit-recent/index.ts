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

// Bound the work so we stay under the edge-function wall-clock limit and the
// AI gateway rate limit.
const MAX_ENTRIES = 150;
const CONCURRENCY = 5;

const SYSTEM_PROMPT = `You are a meticulous fact-checker for an advertising & photography reference archive. You have deep knowledge of brands, agencies, photographers, directors, and notable campaigns.

You receive ONE reference's current fields (title, type, brand, agency, year, source_url, notes). Your job is to detect MISTAKES and return corrections. Each field gets an action:
- "keep"  → the current value is fine (or you are not certain it is wrong). THIS IS THE DEFAULT.
- "set"   → the current value is wrong/placeholder and you KNOW the correct value (provide it).
- "clear" → the current value is wrong/junk and you do NOT know a correct value (brand/agency/year only; title can never be cleared).

Rules:
1. Be conservative. When in doubt, "keep". Only "set"/"clear" when you are confident based on verifiable knowledge of the ACTUAL campaign (matching title + source_url + notes). Never speculate or fill a plausible-sounding value.
2. TITLE: If the title is a generic placeholder ("Video", "YouTube video", "Untitled", "Vimeo", a bare URL, etc.) and you know the real campaign/film title from the source_url or notes, "set" the proper title. If the brand name redundantly prefixes the title (e.g. brand "Kit Kat" + title "Kit Kat: Take a break"), "set" the title to the cleaned version without the redundant brand prefix. Otherwise "keep". Never "set" an empty title.
3. BRAND: If brand holds something that is clearly NOT a brand — an agency name, an award/publisher name, a random tag/acronym (e.g. "COTW"), or it contradicts the known campaign — then "set" the correct brand if known, else "clear". If the brand looks correct, "keep".
4. AGENCY: If agency actually holds the brand, or is wrong, "set" the correct agency if known, else "clear". Otherwise "keep".
5. YEAR: Must be a 4-digit integer between 1950 and the current year, and the verified release year. If clearly wrong, "set" the correct year if known, else "clear". Otherwise "keep".
6. Provide a one-line "reason" summarising what (if anything) you changed and why.

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

async function auditOne(ref: RefRow, apiKey: string): Promise<Record<string, unknown> | null> {
  const userContext = [
    `title: ${ref.title}`,
    `type: ${ref.type || "(unknown)"}`,
    `brand: ${ref.brand ?? "(none)"}`,
    `agency: ${ref.agency ?? "(none)"}`,
    `year: ${ref.year ?? "(none)"}`,
    `source_url: ${ref.source_url ?? "(none)"}`,
    `notes: ${ref.notes ?? "(none)"}`,
  ].join("\n");

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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
        const days = Math.min(Math.max(1, parseInt(body?.days ?? "3", 10) || 3), 30);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        const admin = createClient(supabaseUrl, serviceKey);
        const { data: refs, error } = await admin
          .from("references")
          .select("id,title,type,brand,agency,year,source_url,notes")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(MAX_ENTRIES);

        if (error) { send({ type: "error", message: error.message }); controller.close(); return; }
        const list = (refs as RefRow[]) || [];

        if (list.length === 0) {
          send({ type: "done", checked: 0, fixed: 0, message: `No entries added in the last ${days} day(s).` });
          controller.close();
          return;
        }

        send({ type: "progress", message: `Auditing ${list.length} entries from the last ${days} day(s)…` });

        let checked = 0;
        let fixed = 0;

        for (let i = 0; i < list.length; i += CONCURRENCY) {
          const chunk = list.slice(i, i + CONCURRENCY);
          await Promise.all(
            chunk.map(async (ref) => {
              try {
                const corrections = await auditOne(ref, apiKey);
                checked++;
                if (!corrections) return;
                const update = buildUpdate(ref, corrections);
                if (!update) return;
                const { error: upErr } = await admin.from("references").update(update).eq("id", ref.id);
                if (upErr) {
                  send({ type: "warn", message: `Could not update "${ref.title}": ${upErr.message}` });
                  return;
                }
                fixed++;
                const changed = Object.keys(update)
                  .map((k) => `${k}→${update[k] === null ? "(cleared)" : update[k]}`)
                  .join(", ");
                send({ type: "fix", message: `✓ ${ref.title}: ${changed}`, reason: corrections.reason });
              } catch (e) {
                send({ type: "warn", message: `Skipped "${ref.title}": ${e instanceof Error ? e.message : String(e)}` });
              }
            }),
          );
        }

        send({
          type: "done",
          checked,
          fixed,
          message: `Audited ${checked} entries — ${fixed} corrected.`,
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
