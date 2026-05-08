const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query } = await req.json();
    const q = (query ?? "").toString().trim();
    if (!q || q.length < 2) {
      return new Response(JSON.stringify({ terms: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const systemPrompt = `You expand a short search query into a small list of related keywords for a creative reference library (ads, photography, films). Include: singular/plural forms, common synonyms, broader category words, and closely related concepts. Keep each term 1-2 words, lowercase, no punctuation. Maximum 12 terms. Always include the original query as the first term. Return ONLY via the tool call.`;

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
          { role: "user", content: `Query: ${q}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_terms",
              description: "Return expanded search terms",
              parameters: {
                type: "object",
                properties: {
                  terms: { type: "array", items: { type: "string" } },
                },
                required: ["terms"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_terms" } },
      }),
    });

    if (!aiResp.ok) {
      const text = await aiResp.text();
      console.error("AI error", aiResp.status, text);
      return new Response(JSON.stringify({ terms: [q] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let terms: string[] = [q];
    if (args) {
      try {
        const parsed = JSON.parse(args);
        if (Array.isArray(parsed.terms)) {
          terms = parsed.terms
            .map((t: any) => String(t).toLowerCase().trim())
            .filter((t: string) => t.length > 0)
            .slice(0, 12);
          if (!terms.includes(q.toLowerCase())) terms.unshift(q.toLowerCase());
        }
      } catch (_) {}
    }

    return new Response(JSON.stringify({ terms }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ terms: [], error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
