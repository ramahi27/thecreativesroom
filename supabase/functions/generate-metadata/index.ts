// Generates structured creative metadata for a reference using Lovable AI.
// Returns mood, tone, colour_palette, industry, format, tags, curatorial_note.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a creative reference librarian and visual advertising analyst. You will receive a reference containing a title, brand, and optionally an image_url. Your task is to generate structured metadata for this reference. If an image_url is provided, analyze the image; if it is missing or cannot be used, rely only on the title and brand. Return only the structured tool call with no explanations. Include mood (dark, airy, editorial, gritty, playful, surreal, elegant, raw), tone (commercial, editorial, documentary, experimental, humorous, emotional, etc), colour_palette (warm, cool, neutral, high_contrast, desaturated, vibrant, monochrome, etc), industry (fashion, food, tech, auto, beauty, social_cause, sport, finance, retail, entertainment), format (photo, video, mixed), tags (3-5 short descriptive phrases), and curatorial_note (one concise sentence explaining why the reference is creatively interesting). Prioritize visual analysis when an image is available, otherwise infer intelligently from title and brand context.`;

const TOOL = {
  type: "function",
  function: {
    name: "emit_metadata",
    description: "Emit the structured creative metadata.",
    parameters: {
      type: "object",
      properties: {
        mood: { type: "string" },
        tone: { type: "string" },
        colour_palette: { type: "string" },
        industry: { type: "string" },
        format: { type: "string", enum: ["photo", "video", "mixed"] },
        tags: {
          type: "array",
          items: { type: "string" },
          minItems: 3,
          maxItems: 5,
        },
        curatorial_note: { type: "string" },
      },
      required: [
        "mood",
        "tone",
        "colour_palette",
        "industry",
        "format",
        "tags",
        "curatorial_note",
      ],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, brand, image_url } = await req.json();
    if (!title || typeof title !== "string") {
      return new Response(JSON.stringify({ error: "title is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const userContent: any[] = [
      {
        type: "text",
        text: `title: ${title}\nbrand: ${brand || "(unknown)"}${
          image_url ? `\nimage_url: ${image_url}` : ""
        }`,
      },
    ];
    if (image_url && typeof image_url === "string") {
      userContent.push({ type: "image_url", image_url: { url: image_url } });
    }

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
            { role: "user", content: userContent },
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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
