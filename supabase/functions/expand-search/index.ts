import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_TERM_LEN = 100;
const DAILY_IP_LIMIT = 300; // generous for real use, blocks scripted abuse

// Hash an IP address with a secret key so raw PII is never persisted.
async function hashIp(ip: string): Promise<string> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "salt";
  const data = new TextEncoder().encode(`${secret}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { term } = await req.json();
    if (!term || typeof term !== "string" || term.trim().length < 2) {
      return new Response(JSON.stringify({ terms: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const cleanTerm = term.trim().slice(0, MAX_TERM_LEN);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    // ── Rate limiting (per hashed IP, per day) ─────────────────────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const today = new Date().toISOString().split("T")[0];
    const rawIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const ipHash = await hashIp(rawIp);
    const { data: usageRow } = await supabase
      .from("search_usages")
      .select("count")
      .eq("ip_hash", ipHash)
      .eq("usage_date", today)
      .maybeSingle();
    const usedToday = usageRow?.count ?? 0;
    if (usedToday >= DAILY_IP_LIMIT) {
      // Fail soft: return no expansion terms; regular keyword search still works.
      return new Response(JSON.stringify({ terms: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await supabase.from("search_usages").upsert(
      { ip_hash: ipHash, usage_date: today, count: usedToday + 1 },
      { onConflict: "ip_hash,usage_date" }
    );
    // ── End rate limiting ──────────────────────────────────────────────────

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: `Given the search term "${cleanTerm}", return 4–6 direct synonyms and alternate names ONLY — the same concept expressed differently (abbreviations, spelling variants, equivalent words, direct translations). Do NOT include loosely associated themes, actions, or topics. Return ONLY a JSON array of lowercase strings, no explanation.\nExamples:\n- "christmas" → ["xmas","noel","yuletide","holiday season","festive season"]\n- "car" → ["automobile","vehicle","auto","motor"]\n- "woman" → ["women","female","girl","lady"]\n- "sport" → ["sports","athletic","athletics"]`,
          },
        ],
        max_tokens: 150,
        temperature: 0.2,
      }),
    });

    if (!aiResp.ok) throw new Error(`AI gateway error: ${aiResp.status}`);

    const json = await aiResp.json();
    const raw = json.choices?.[0]?.message?.content || "[]";

    let terms: string[] = [];
    try {
      const match = raw.match(/\[[\s\S]*?\]/);
      terms = match ? JSON.parse(match[0]) : [];
    } catch {
      terms = [];
    }

    const clean = terms
      .filter((t) => typeof t === "string" && t.trim().length > 0)
      .map((t) => t.toLowerCase().trim())
      .slice(0, 12);

    return new Response(JSON.stringify({ terms: clean }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("expand-search error:", e);
    return new Response(JSON.stringify({ terms: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
