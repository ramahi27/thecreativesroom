import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { brief } = await req.json();
    if (!brief || typeof brief !== "string" || brief.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Brief is too short" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch all published refs (compact)
    const { data: refs, error } = await supabase
      .from("references")
      .select("id,title,brand,agency,tags,categories,type,notes")
      .eq("published", true)
      .limit(2000);
    if (error) throw error;

    const compact = (refs || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      brand: r.brand ?? null,
      agency: r.agency ?? null,
      tags: r.tags ?? [],
      categories: r.categories ?? [],
      format: r.type,
      notes: (r.notes ?? "").slice(0, 200),
    }));

    const systemPrompt = `You are a senior creative director and visual research expert with 20 years of experience in advertising, film, and editorial photography. Your job is to analyse a creative brief and match it against a library of reference campaigns with extreme precision.

When given a brief, you must identify and weight these dimensions:

VISUAL DIMENSIONS (analyse each carefully):
- Colour temperature: warm (golden, amber, orange tones) / cool (blue, teal, grey tones) / neutral / high contrast / desaturated / monochrome / neon / pastel
- Lighting style: hard directional light / soft diffused / natural / low-key / high-key / silhouette / golden hour / fluorescent / practical lights / chiaroscuro
- Composition: tight close-up / wide establishing / symmetrical / off-centre / overhead / low angle / Dutch angle / negative space heavy / layered depth
- Colour palette: identify up to 3 dominant colours and their emotional register
- Texture and grain: clean and digital / film grain / gritty / smooth / tactile / raw

MOOD & EMOTIONAL REGISTER:
- Primary emotion the work should evoke: joy / melancholy / tension / warmth / alienation / nostalgia / aspiration / rebellion / intimacy / awe / humour / discomfort / calm / urgency
- Energy level: static and contemplative / slow burn / dynamic and kinetic / frenetic
- Tone: sincere / ironic / deadpan / playful / reverent / provocative / matter-of-fact

EDITING & PACING (for video refs):
- Cut frequency: slow / medium / fast / mixed
- Transition style: hard cuts / dissolves / match cuts / jump cuts / no cuts (single take)
- Camera movement: static / slow push / handheld / tracking / drone / whip pan
- Rhythm: matches music / natural pacing / against the beat

CASTING & HUMAN ELEMENT:
- Presence of people: none / single subject / couple / group / crowd
- Casting type: celebrity / everyday real people / models / children / elderly / diverse ensemble / animals
- Performance style: naturalistic / stylised / documentary / theatrical / comedic

CONCEPT & NARRATIVE:
- Storytelling approach: emotional narrative / product demonstration / slice of life / surreal / metaphorical / documentary / testimonial / comedy / shock / beauty
- Brand presence: product hero / lifestyle / brand values / social cause / entertainment-first
- Copy-led vs visual-led: heavy copy / minimal copy / no copy / title card only

INDUSTRY & CONTEXT:
- Sector: fashion / beauty / food & drink / tech / auto / finance / retail / social cause / sport / entertainment / luxury / FMCG
- Market feel: mass market / premium / luxury / challenger brand / institutional

MATCHING INSTRUCTIONS:
1. Parse the brief carefully — extract explicit mentions (colours, moods, references to other work) AND implicit signals (a brief saying "intimate" implies close-up, soft light, natural casting even if not stated).
2. Read between the lines — "dark and cinematic" means low-key lighting, desaturated palette, slow pacing, serious tone. "Fresh and energetic" means bright colours, fast cuts, young casting, upbeat rhythm. Apply this inference aggressively.
3. Weight the match across all dimensions — do not just match on category or format. A fashion campaign and a car campaign can both be "dark and cinematic" and should both surface for that brief.
4. Penalise obvious mismatches hard — if the brief says "warm and joyful" never return cool, desaturated, or melancholic refs regardless of category match.
5. Return exactly 8 results, ranked from strongest to weakest match.
6. For each match, provide a precise, specific reason (never generic) naming the visual, mood, or stylistic element that connects it to the brief, plus a 0-100 match_score and 2-3 strongest matching dimensions.

Return ONLY via the tool call.`;

    const userPrompt = `BRIEF:\n${brief}\n\nREFERENCES (JSON):\n${JSON.stringify(compact)}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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
    let matches: Array<{ id: string; reason: string }> = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        matches = (parsed.matches || []).slice(0, 8);
      } catch (e) {
        console.error("parse error", e);
      }
    }

    // Validate IDs against known refs
    const validIds = new Set(compact.map((r) => r.id));
    matches = matches.filter((m) => validIds.has(m.id));

    // Persist brief reasoning into each matched reference's metadata for future learning.
    // Stored as a `brief_reason:` prefixed tag (deduped) and appended to notes.
    const briefSnippet = brief.trim().slice(0, 120).replace(/\s+/g, " ");
    await Promise.all(
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

    return new Response(JSON.stringify({ matches }), {
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
