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

    const systemPrompt = `You are a senior creative director picking visual references for a brief. From a JSON list of references (id, title, brand, agency, tags, categories, format, notes), select the 8 most creatively relevant to the user's brief. Rank by creative fit (mood, tone, format, idea, brand). Return ONLY via the tool call.`;

    const userPrompt = `BRIEF:\n${brief}\n\nREFERENCES (JSON):\n${JSON.stringify(compact)}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
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
                        reason: { type: "string", description: "One short line on why it fits." },
                      },
                      required: ["id", "reason"],
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
