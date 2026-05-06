// Generates descriptive tags AND infers missing campaign metadata
// (brand, agency, year) for a reference using Lovable AI. The model uses
// its training-data knowledge of advertising/photography campaigns to fill
// in the blanks — useful when admins approve or add a project where these
// fields are unknown.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a creative reference librarian and advertising/photography campaign expert with deep knowledge of brands, agencies, photographers, directors, and notable campaigns.

You will receive a reference describing an advertising or photography project (title, possibly brand, agency, year, source URL, notes). Your job:
1. Produce 15-30 short, descriptive, lowercase tag phrases (1-3 words each) covering themes, industry, audience, style cues, emotional tone, cultural context, and creative angles. No duplicates, no hashtags, no explanations.
2. If brand, agency, or year are missing or empty, only fill them in when you are 100% certain based on verifiable knowledge of the actual campaign (matching title + source URL + known credits). If there is ANY doubt, ambiguity, or you are merely guessing/inferring from patterns, leave the field null. Do NOT speculate. Do NOT fill a plausible-sounding agency just because it fits the brand. Year must be an integer between 1950 and the current year and must be the verified release year. Do NOT overwrite values that were already supplied — those are sent only as context.

Return only the structured tool call.`;

const TOOL = {
  type: "function",
  function: {
    name: "emit_metadata",
    description: "Emit tags and inferred missing campaign metadata.",
    parameters: {
      type: "object",
      properties: {
        tags: {
          type: "array",
          items: { type: "string" },
          minItems: 15,
          maxItems: 30,
        },
        brand: {
          type: ["string", "null"],
          description:
            "Inferred brand/advertiser name if missing. Null if unknown or already provided.",
        },
        agency: {
          type: ["string", "null"],
          description:
            "Inferred creative agency or production company if missing. Null if unknown or already provided.",
        },
        year: {
          type: ["integer", "null"],
          description:
            "Inferred year (4-digit) the campaign was released if missing. Null if unknown or already provided.",
        },
      },
      required: ["tags"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      title,
      brand = null,
      agency = null,
      year = null,
      source_url = null,
      notes = null,
    } = body || {};
    if (!title || typeof title !== "string") {
      return new Response(JSON.stringify({ error: "title is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const userContext = [
      `title: ${title}`,
      `brand: ${brand || "(missing — please infer if possible)"}`,
      `agency: ${agency || "(missing — please infer if possible)"}`,
      `year: ${year || "(missing — please infer if possible)"}`,
      `source_url: ${source_url || "(none)"}`,
      `notes: ${notes || "(none)"}`,
    ].join("\n");

    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContext },
          ],
          tools: [TOOL],
          tool_choice: {
            type: "function",
            function: { name: "emit_metadata" },
          },
        }),
      },
    );

    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error:", resp.status, t);
      if (resp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (resp.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add funds in workspace usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      return new Response(JSON.stringify({ error: "No metadata returned" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const metadata = JSON.parse(call.function.arguments);

    return new Response(JSON.stringify({ metadata }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-metadata error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
