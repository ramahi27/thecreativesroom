import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LIMITS = { anon: 1, free: 3, paid: 50, admin: 50 } as const;
type Plan = keyof typeof LIMITS;
const MAX_BRIEF_LEN = 2000;
const PREFILTER_LIMIT = 200;

const STOP_WORDS = new Set([
  "a","an","the","and","or","but","for","with","that","this","are","was","not",
  "all","can","its","our","you","your","me","im","get","give","some","need",
  "want","looking","working","make","just","very","more","like","also","into",
  "have","has","from","about","would","could","should","will","been","their",
  "there","they","what","when","which","who","how","one","two","three","we",
  "be","do","is","it","in","on","of","to","at","by","as","up","so","no",
]);

// Fast keyword-based pre-filter: scores all refs and returns the top N most
// likely to match the brief, so the AI only sees a focused, relevant subset.
function preFilter(brief: string, refs: any[]): any[] {
  const briefLower = brief.toLowerCase();

  // Tokenise brief into meaningful words
  const briefWords = [...new Set(
    briefLower.split(/\W+/).filter(w => w.length > 2 && !STOP_WORDS.has(w))
  )];

  // Detect if the brief is primarily about editing/pacing
  const isEditingBrief = /\b(cut|cuts|edit|editing|pacing|pace|fast|quick|rapid|slow|burn|transition|rhythm|montage|sequence)\b/.test(briefLower);
  // Detect if it's a video brief
  const isVideoBrief = isEditingBrief || /\b(video|commercial|ad|spot|film|promo|reel|trailer)\b/.test(briefLower);

  const scored = refs.map(r => {
    let score = 0;

    // Type bonus: editing/video briefs favour video refs
    if (isVideoBrief && r.format === "video") score += 8;
    // Penalise image refs for editing briefs
    if (isEditingBrief && r.format !== "video") score -= 10;

    // Tag overlap (most reliable signal)
    const tags: string[] = (r.tags ?? []).map((t: string) => t.toLowerCase());
    for (const word of briefWords) {
      for (const tag of tags) {
        if (tag.includes(word) || word.includes(tag)) { score += 3; break; }
      }
    }

    // Category match
    const cats: string[] = (r.categories ?? []).map((c: string) => c.toLowerCase());
    for (const cat of cats) {
      if (briefLower.includes(cat)) score += 4;
    }

    // Keywords in editing_style (highest value for editing briefs)
    if (r.editing_style) {
      const esl = r.editing_style.toLowerCase();
      for (const word of briefWords) {
        if (esl.includes(word)) score += (isEditingBrief ? 4 : 1);
      }
    }

    // Keywords in visual_summary
    if (r.visual_summary) {
      const vsl = r.visual_summary.toLowerCase();
      for (const word of briefWords) {
        if (vsl.includes(word)) score += 2;
      }
    }

    // Title match
    const titleL = (r.title ?? "").toLowerCase();
    for (const word of briefWords) {
      if (titleL.includes(word)) score += 1;
    }

    return { ref: r, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, PREFILTER_LIMIT).map(s => s.ref);
}

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
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const authClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const token = authHeader.replace("Bearer ", "");
        const { data: userData } = await authClient.auth.getUser(token);
        userId = userData?.user?.id ?? null;
      } catch (_) {
        // treat as anonymous
      }
    }

    const { brief: rawBrief } = await req.json();
    if (!rawBrief || typeof rawBrief !== "string" || rawBrief.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Brief is too short" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Cap input length to prevent abuse and runaway token costs.
    const brief = rawBrief.slice(0, MAX_BRIEF_LEN);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Rate limiting ────────────────────────────────────────────────────────
    const today = new Date().toISOString().split("T")[0];
    const rawIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const ip = await hashIp(rawIp); // store only a salted hash, never the raw IP
    let plan: Plan = "anon";
    let usedToday = 0;

    if (userId) {
      const [{ data: profile }, { data: usageRow }, { data: adminRow }] = await Promise.all([
        supabase.from("profiles").select("plan").eq("user_id", userId).maybeSingle(),
        supabase.from("brief_usages").select("count").eq("user_id", userId).eq("usage_date", today).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
      ]);
      plan = adminRow ? "admin" : ((profile?.plan as Plan) || "free");
      usedToday = usageRow?.count ?? 0;
    } else {
      const { data: usageRow } = await supabase
        .from("brief_usages")
        .select("count")
        .eq("ip_address", ip)
        .is("user_id", null)
        .eq("usage_date", today)
        .maybeSingle();
      usedToday = usageRow?.count ?? 0;
    }

    const limit = LIMITS[plan];
    if (usedToday >= limit) {
      return new Response(
        JSON.stringify({ error: "limit_reached", used: usedToday, limit, plan }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // ── End rate limiting ────────────────────────────────────────────────────

    // Only admins can have brief reasoning persisted back into reference metadata.
    const isAdmin = plan === "admin";

    // Fetch all published refs (compact)
    const { data: refs, error } = await supabase
      .from("references")
      .select("id,title,brand,agency,tags,categories,type,notes,visual_summary,editing_style")
      .eq("published", true)
      .limit(2000);
    if (error) throw error;

    const filtered = preFilter(brief, refs || []);

    const compact = filtered.map((r: any) => ({
      id: r.id,
      title: r.title,
      brand: r.brand ?? null,
      agency: r.agency ?? null,
      tags: r.tags ?? [],
      categories: r.categories ?? [],
      format: r.type,
      visual_summary: r.visual_summary ?? null,
      editing_style: r.editing_style ?? null,
      // include notes only as fallback when no visual_summary exists yet
      notes: r.visual_summary ? null : (r.notes ?? "").slice(0, 150),
    }));

    const systemPrompt = `You are a senior creative director and visual research expert with 20 years of experience across advertising, film, and commercial photography. You specialise in identifying precise visual, tonal, and stylistic references for creative briefs.

IMPORTANT: Each reference may include:
- "visual_summary": curated description of visual character (colour, lighting, mood, casting). PRIMARY signal for visual/mood briefs.
- "editing_style": curated description of editing pace, transitions, rhythm, and structural devices. PRIMARY signal for editing/pacing briefs (e.g. "quick cuts", "slow burn", "single take").

When either field is present, treat it as the most reliable signal for its respective dimension, weighted above tags or title alone.

## STEP 1 — DECOMPOSE THE BRIEF

Before evaluating any reference, read the brief and identify:

PRIMARY_DIMENSION — the single creative axis the brief cares about most:
  editing_pacing | colour_palette | lighting | mood_tone | casting | concept_narrative | industry_sector | format_style

KEY_SIGNALS — 3–5 specific inferred attributes the ideal reference must have.
Read between the lines: "quick cuts" → fast cut frequency, music-synced, high energy, hard cuts.
"dark and cinematic" → low-key lighting, desaturated, slow burn, serious tone.
"playful and colourful" → bright palette, fast/medium cuts, energetic, light tone.

HARD_EXCLUSIONS — attributes that would be an obvious mismatch. A reference failing a hard exclusion scores ≤ 20 and should only appear if the library has nothing better.

## STEP 2 — SCORE EACH REFERENCE

Score each reference 0–100 using this weighting:

- PRIMARY_DIMENSION: 60 points
  Nailing the primary dimension: 50–60 pts. Missing it: 0–15 pts (unlikely to make the top 8).
- SECONDARY DIMENSIONS: 40 points total across relevant dimensions below.
- Hard exclusion penalty: cap score at 20.

Penalise obvious mismatches hard even outside hard exclusions.

## VISUAL ANALYSIS DIMENSIONS

COLOUR & LIGHT
- Colour temperature: warm / cool / neutral / desaturated / monochrome / neon / pastel
- Lighting style: hard / soft / natural / low-key / high-key / silhouette / golden hour / fluorescent / chiaroscuro
- Colour palette: 3 dominant tones + emotional register

MOOD & TONE
- Emotions: joy / melancholy / tension / warmth / alienation / nostalgia / aspiration / rebellion / intimacy / awe / humour / discomfort / calm / urgency
- Energy level: static / slow burn / dynamic / frenetic
- Tone: sincere / ironic / deadpan / playful / reverent / provocative / matter-of-fact

EDITING & PACING (video)
- Cut frequency: slow / medium / fast / very fast
- Transition style: hard cuts / dissolves / match cuts / jump cuts / single take
- Camera movement: static / push / handheld / tracking / drone / whip pan
- Rhythm: music-synced / natural pacing / against beat

CASTING & PERFORMANCE
- People: none / single / couple / group / crowd
- Type: celebrity / real people / models / children / elderly / diverse / animals
- Performance: naturalistic / stylised / documentary / theatrical / comedic

CONCEPT & NARRATIVE
- Storytelling: emotional / product demo / slice of life / surreal / metaphorical / documentary / testimonial / comedy / shock / beauty
- Brand presence: product hero / lifestyle / brand values / social cause / entertainment
- Copy: heavy / minimal / none / title only

INDUSTRY & FORMAT
- Sector: fashion / beauty / food / tech / auto / finance / retail / social / sport / entertainment / luxury / FMCG
- Market feel: mass / premium / luxury / challenger / institutional
- Format: TV spot / digital / OOH / print / social / branded content / spec

## OUTPUT RULES

- Return exactly 8 references, ranked strongest to weakest.
- **Diversity**: no more than 2 results from the same brand. If a brand has 5 great matches, pick the 2 strongest and use the freed slots for the next-best from other brands.
- **Avoid defaulting to famous campaigns**: if a lesser-known reference scores equally or better on the PRIMARY_DIMENSION, prefer it over an iconic well-known campaign. The goal is to surface the most precise creative match, not the most recognisable one.
- Each reason must be one precise sentence naming the PRIMARY_DIMENSION match and 1–2 supporting details. Never write generic reasons like "matches the brief" or "fits the mood."
- Use the return_matches tool — no prose outside the tool call.`;

    const userPrompt = `BRIEF:\n${brief}\n\nREFERENCES (JSON):\n${JSON.stringify(compact)}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_matches",
              description: "Return the 8 best-matching references ranked by creative fit.",
              parameters: {
                type: "object",
                properties: {
                  matches: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                       id: { type: "string" },
                        match_score: { type: "number", description: "0-100 strength of fit." },
                        match_dimensions: {
                          type: "array",
                          items: { type: "string" },
                          description: "2-3 strongest matching dimensions (e.g. colour, mood, lighting).",
                        },
                        reason: {
                          type: "string",
                          description: "One precise sentence on the specific visual/mood/stylistic element that connects this ref to the brief. Never generic.",
                        },
                      },
                      required: ["id", "match_score", "match_dimensions", "reason"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["matches"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_matches" } },
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI error", aiResp.status, txt);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit, try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    let matches: Array<{ id: string; reason: string; match_score?: number; match_dimensions?: string[] }> = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        matches = (parsed.matches || []).slice(0, 8);
      } catch (e) {
        // Distinguish a parse failure from a genuine "no matches" result so the
        // client can tell the user to retry instead of showing an empty state.
        console.error("parse error", e);
        return new Response(
          JSON.stringify({ error: "Could not read AI response. Please try again." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Validate IDs against known refs
    const validIds = new Set(compact.map((r) => r.id));
    matches = matches.filter((m) => validIds.has(m.id));

    // Persist brief reasoning into each matched reference's metadata for future learning.
    // Restricted to admins to prevent arbitrary content injection from any signed-in user.
    const briefSnippet = brief.trim().slice(0, 120).replace(/\s+/g, " ");
    if (isAdmin) await Promise.all(
      matches.map(async (m) => {
        try {
          const { data: cur } = await supabase
            .from("references")
            .select("tags,notes")
            .eq("id", m.id)
            .maybeSingle();
          const existingTags: string[] = Array.isArray(cur?.tags) ? cur!.tags : [];
          const reasonTag = `brief_reason:${m.reason.slice(0, 140)}`;
          const briefTag = `brief:${briefSnippet}`;
          const mergedTags = Array.from(new Set([...existingTags, reasonTag, briefTag]));
          const noteLine = `\n\n[brief match] ${briefSnippet} → ${m.reason}`;
          const newNotes = (cur?.notes || "").includes(m.reason)
            ? cur?.notes
            : ((cur?.notes || "") + noteLine).slice(0, 8000);
          await supabase
            .from("references")
            .update({ tags: mergedTags, notes: newNotes })
            .eq("id", m.id);
        } catch (e) {
          console.error("persist reason failed", m.id, e);
        }
      })
    );

    // Increment usage counter
    const newCount = usedToday + 1;
    if (userId) {
      await supabase.from("brief_usages").upsert(
        { user_id: userId, usage_date: today, count: newCount },
        { onConflict: "user_id,usage_date" }
      );
    } else {
      await supabase.from("brief_usages").upsert(
        { ip_address: ip, usage_date: today, count: newCount },
        { onConflict: "ip_address,usage_date" }
      );
    }

    return new Response(JSON.stringify({ matches, used: newCount, limit, plan }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("match-brief error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
