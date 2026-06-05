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

You will receive a reference describing an advertising or photography project (title, type [image|video], possibly brand, agency, year, source URL, notes). Your job:
1. Produce 15-30 short, descriptive, lowercase tag phrases (1-3 words each) covering themes, industry, audience, style cues, emotional tone, cultural context, and creative angles. No duplicates, no hashtags, no explanations.
2. Produce a separate list of 20-60 lowercase synonyms / alternative search terms / plurals / related concepts for the tags. These are HIDDEN search-only metadata. For example, if a tag is "car", include "cars", "vehicles", "automobile", "automobiles", "auto", "driving", "transport", etc. Cover singular/plural forms, common synonyms, broader and narrower terms, and related concepts a user might search for. No duplicates with the visible tags.
3. If brand, agency, or year are missing or empty, only fill them in when you are 100% certain based on verifiable knowledge of the actual campaign (matching title + source URL + known credits). If there is ANY doubt, ambiguity, or you are merely guessing/inferring from patterns, leave the field null. Do NOT speculate. Do NOT fill a plausible-sounding agency just because it fits the brand. Year must be an integer between 1950 and the current year and must be the verified release year. Do NOT overwrite values that were already supplied — those are sent only as context.
4. If type is "video", produce a concise editing_style description (1-3 sentences, max ~280 chars) describing the editing approach: pacing (fast cuts, slow dissolves, long takes), transitions (jump cuts, match cuts, whip pans, cross-dissolves), rhythm (music-driven, beat-synced, organic), structural devices (montage, split-screen, intercutting, non-linear), and any signature editorial techniques. Base this on verifiable knowledge of the actual film/spot when possible; otherwise infer from title/notes/source. For non-video references, leave editing_style null.

Return only the structured tool call.`;

const TOOL = {
  type: "function",
  function: {
    name: "emit_metadata",
    description: "Emit tags, hidden synonyms, and inferred missing campaign metadata.",
    parameters: {
      type: "object",
      properties: {
        tags: {
          type: "array",
          items: { type: "string" },
          minItems: 15,
          maxItems: 30,
        },
        tag_synonyms: {
          type: "array",
          description:
            "Hidden search-only synonyms / alternatives / plurals / related terms for the tags. Not shown in the UI.",
          items: { type: "string" },
          minItems: 0,
          maxItems: 80,
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
        editing_style: {
          type: ["string", "null"],
          description:
            "For video references only: 1-3 sentence description of the editing style (pacing, transitions, rhythm, structural devices). Null for non-video.",
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
    // Require authenticated user to prevent AI credit abuse.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Require admin role — prevent any logged-in user from burning AI credits
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: roleData } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      title,
      brand = null,
      agency = null,
      year = null,
      source_url = null,
      notes = null,
      type = null,
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
      `type: ${type || "(unknown)"}`,
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
