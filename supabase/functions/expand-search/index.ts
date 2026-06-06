const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { term } = await req.json();
    if (!term || typeof term !== "string" || term.trim().length < 2) {
      return new Response(JSON.stringify({ terms: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

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
            content: `Given the search term "${term.trim()}", return 6–10 synonyms and closely related terms a creative professional might use when searching an advertising, film, and photography archive. Include the original term. Return ONLY a JSON array of lowercase strings, no explanation. Example for "cars": ["car","cars","automobile","vehicle","automotive","road","driving"]`,
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
