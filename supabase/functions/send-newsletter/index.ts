import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SITE_URL = "https://thecreativesroom.com";

type RefInput = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  brand: string | null;
  categories: string[];
  type: string;
  visual_summary: string | null;
  year: number | null;
};

type EnrichedContent = {
  blurbs: Record<string, string>;
  intro: string;
  subject: string;
};

function refUrl(r: RefInput): string {
  const slug = r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${SITE_URL}/ref/${r.id}${slug ? `-${slug}` : ""}`;
}

// Proxy YouTube/Vimeo thumbnails through wsrv.nl so email clients can load them.
// For YouTube, try maxres → sd → hq with wsrv's chained fallback so we never end up with a 404 or 120px blur.
function emailThumb(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (host.includes("ytimg.com")) {
      const m = url.match(/\/vi\/([^/]+)\//);
      if (m) {
        const id = m[1];
        const maxres = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
        const sd = `https://i.ytimg.com/vi/${id}/sddefault.jpg`;
        const hq = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
        return `https://wsrv.nl/?url=${encodeURIComponent(maxres)}&w=1200&output=jpg&q=90&errorredirect=${encodeURIComponent(
          `https://wsrv.nl/?url=${sd}&w=1200&output=jpg&q=90&errorredirect=${encodeURIComponent(
            `https://wsrv.nl/?url=${hq}&w=1200&output=jpg&q=90`,
          )}`,
        )}`;
      }
      return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=1200&output=jpg&q=90`;
    }
    if (host.includes("vumbnail.com")) {
      const large = url.replace(/(\/[^/]+?)(_(?:small|medium|large))?\.jpg$/, "$1_large.jpg");
      return `https://wsrv.nl/?url=${encodeURIComponent(large)}&w=1200&output=jpg&q=90`;
    }
    if (host.includes("vimeocdn.com")) {
      return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=1200&output=jpg&q=90`;
    }
  } catch { /* noop */ }
  return url;
}

// Fetch top headlines from BBC News RSS — no API key needed
async function fetchCurrentEvents(): Promise<string> {
  try {
    const res = await fetch("https://feeds.bbci.co.uk/news/world/rss.xml", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; newsletter-curator/1.0)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "";
    const xml = await res.text();
    let titles = [...xml.matchAll(/<title><!\[CDATA\[(.+?)\]\]><\/title>/g)].map((m) => m[1]);
    if (titles.length === 0) {
      titles = [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>/g)].map((m) =>
        m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim(),
      );
    }
    // Keep only culturally relevant headlines — drop crime, war, disasters
    const blocklist = /\b(kill|killed|dead|death|murder|arrest|bust|cocaine|drug|war|attack|shoot|stab|bomb|terror|court|prison|jail|guilty|verdict|resign|flood|earthquake|hurricane|wildfire|hostage|kidnap|rape|crash|explosion|sanction|protest|riot|refugee|migrant|poverty|famine|drought)\b/i;
    const cultural = titles.slice(1).filter((t) => !blocklist.test(t));
    return cultural.slice(0, 15).join(" | ");
  } catch {
    return "";
  }
}

async function curateRefs(refs: RefInput[], apiKey: string, contextLine: string): Promise<RefInput[]> {
  if (refs.length === 0) return refs;

  const today = new Date().toISOString().split("T")[0];
  const list = refs.map((r, i) =>
    `${i + 1}. "${r.title}"${r.brand ? ` by ${r.brand}` : ""}${r.year ? ` (${r.year})` : ""}${r.categories?.[0] ? ` [${r.categories[0]}]` : ""}${r.visual_summary ? ` — ${r.visual_summary.slice(0, 100)}` : ""}`
  ).join("\n");

  const prompt = `You are curating a weekly creative newsletter. Today is ${today}.

${contextLine}

STRICT rules — follow them exactly:
- Return exactly 10 references
- Exactly 8 MUST be from 2024 or newer ("new")
- Exactly 2 MUST be from 2023 or older ("classics")
- The FIRST reference in your returned list MUST be a new (2024+) project
- Rank by relevance to this week's moment — most relevant first
- Among the new picks, prioritise projects released closest to today
- The 2 classics should only be included if they meaningfully connect to this week's events

References:
${list}

Return ONLY a JSON array of 1-based indices in the order you want them to appear. Example: [3, 7, 1, 5, 2, 9, 4, 6, 8, 10]`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }),
  });

  if (!res.ok) return refs.slice(0, 10);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  try {
    const match = text.match(/\[[\d,\s]+\]/);
    if (!match) return refs.slice(0, 10);
    const indices: number[] = JSON.parse(match[0]);
    const curated = indices
      .filter((i) => i >= 1 && i <= refs.length)
      .map((i) => refs[i - 1]);
    return curated.length >= 3 ? curated : refs.slice(0, 10);
  } catch {
    return refs.slice(0, 10);
  }
}

async function generateEnrichedContent(
  refs: RefInput[],
  apiKey: string,
  contextLine: string,
): Promise<EnrichedContent> {
  const fallback: EnrichedContent = { blurbs: {}, intro: "", subject: "" };
  if (refs.length === 0) return fallback;

  const list = refs.map((r, i) =>
    `${i + 1}. "${r.title}"${r.brand ? ` by ${r.brand}` : ""}${r.year ? ` (${r.year})` : ""}${r.categories?.[0] ? ` [${r.categories[0]}]` : ""}${r.visual_summary ? ` — ${r.visual_summary.slice(0, 120)}` : ""}`
  ).join("\n");

  const prompt = `You are writing content for The Creatives Room — a curated creative reference newsletter. Today's context: ${contextLine}

References:
${list}

Return a single JSON object with exactly these 4 keys:

"blurbs": For each reference, one punchy sentence. Reference #1 (hero pick): max 32 words — room for a specific evocative detail. References #2–${refs.length}: max 24 words each. Rules: do NOT start with or repeat the title, be specific and evocative, sound like a creative director, no filler ("this is", "a must-see"). Format: { "1": "...", "2": "...", ... }

"intro": A 2–3 sentence editorial opener. Name 1–2 specific current events from the context by name (not generically). Bridge to these references — explain the connective tissue. Max 55 words. Do NOT start with "This week".

"subject": A punchy email subject line, 8–10 words, no trailing punctuation. Reference 1–2 named cultural moments ONLY — festivals, sports championships, award shows, film releases, fashion weeks, product launches. NEVER mention crime, violence, political crises, or negative news. Hint at creative content. Do NOT say "newsletter" or "The Creatives Room". Example style: "Cannes, Wimbledon, and the ads you need to see"`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) return fallback;
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(text);
    return {
      blurbs: parsed.blurbs ?? {},
      intro: typeof parsed.intro === "string" ? parsed.intro : "",
      subject: typeof parsed.subject === "string" ? parsed.subject : "",
    };
  } catch {
    return fallback;
  }
}

function buildHeroCard(r: RefInput, blurb: string): string {
  const url = refUrl(r);
  const meta = [r.brand, r.categories?.[0]].filter(Boolean).join(" · ");
  const thumb = r.thumbnail_url
    ? `<img src="${emailThumb(r.thumbnail_url)}" alt="${r.title.replace(/"/g, "&quot;")}" width="560" style="width:100%;max-width:560px;display:block;" />`
    : `<div style="width:100%;height:80px;background:#1a1a1a;"></div>`;

  return `
<tr><td style="padding:0 0 36px 0;">
  <a href="${url}" style="display:block;text-decoration:none;background:#111;border-radius:12px;overflow:hidden;border:1px solid #333;">
    <div style="padding:14px 24px 0;">
      <p style="margin:0;font-family:monospace;font-size:9px;text-transform:uppercase;letter-spacing:0.25em;color:#f46a20;">★ Pick of the week</p>
    </div>
    <div style="margin-top:12px;">${thumb}</div>
    <div style="padding:22px 26px 24px;">
      ${meta ? `<p style="margin:0 0 8px 0;font-family:monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.15em;color:#f46a20;">${meta}</p>` : ""}
      <p style="margin:0 0 10px 0;font-family:Georgia,serif;font-size:28px;font-weight:700;color:#f5f0e8;line-height:1.2;">${r.title}</p>
      ${blurb ? `<p style="margin:0;font-family:Georgia,serif;font-size:15px;color:#bbb;line-height:1.6;font-style:italic;">${blurb}</p>` : ""}
    </div>
  </a>
</td></tr>`;
}

function buildRegularCard(r: RefInput, blurb: string): string {
  const url = refUrl(r);
  const meta = [r.brand, r.categories?.[0]].filter(Boolean).join(" · ");
  const thumb = r.thumbnail_url
    ? `<img src="${emailThumb(r.thumbnail_url)}" alt="${r.title.replace(/"/g, "&quot;")}" width="560" style="width:100%;max-width:560px;display:block;border-radius:6px 6px 0 0;" />`
    : `<div style="width:100%;height:80px;background:#1a1a1a;border-radius:6px 6px 0 0;"></div>`;

  return `
<tr><td style="padding:0 0 24px 0;">
  <a href="${url}" style="display:block;text-decoration:none;background:#111;border-radius:10px;overflow:hidden;border:1px solid #222;">
    ${thumb}
    <div style="padding:16px 22px 18px;">
      ${meta ? `<p style="margin:0 0 5px 0;font-family:monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.15em;color:#f46a20;">${meta}</p>` : ""}
      <p style="margin:0 0 7px 0;font-family:Georgia,serif;font-size:18px;font-weight:700;color:#f5f0e8;line-height:1.25;">${r.title}</p>
      ${blurb ? `<p style="margin:0;font-family:Georgia,serif;font-size:14px;color:#999;line-height:1.55;font-style:italic;">${blurb}</p>` : ""}
    </div>
  </a>
</td></tr>`;
}

function buildHtml(
  refs: RefInput[],
  blurbs: Record<string, string>,
  subject: string,
  intro = "",
): string {
  const [hero, ...rest] = refs;
  const heroRow = hero ? buildHeroCard(hero, blurbs["1"] || "") : "";
  const restRows = rest.map((r, i) =>
    buildRegularCard(r, blurbs[String(i + 2)] || "")
  ).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr><td align="center" style="padding:48px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

        <!-- Header -->
        <tr><td style="padding:0 0 36px 0;border-bottom:1px solid #222;">
          <p style="margin:0 0 10px 0;font-family:monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.3em;color:#f46a20;">⏵ The Creatives Room</p>
          <h1 style="margin:0;font-family:Georgia,serif;font-size:30px;font-weight:900;color:#f5f0e8;letter-spacing:-0.02em;line-height:1.1;">${subject}</h1>
        </td></tr>

        ${intro ? `<!-- Intro -->
        <tr><td style="padding:24px 0 8px 0;">
          <p style="margin:0;font-family:Georgia,serif;font-size:15px;line-height:1.65;color:#cfcfcf;">${intro.replace(/\n/g, "<br>")}</p>
        </td></tr>` : ""}

        <!-- References -->
        <tr><td style="padding:32px 0 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${heroRow}
            ${restRows}
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:8px 0 32px 0;text-align:center;">
          <a href="${SITE_URL}" style="display:inline-block;background:#f46a20;color:#fff;font-family:monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.15em;text-decoration:none;padding:12px 28px;border-radius:99px;">Browse the full archive</a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 0 0 0;border-top:1px solid #1a1a1a;">
          <p style="margin:0;font-family:monospace;font-size:10px;color:#444;text-align:center;">
            You're receiving this because you have an account on <a href="${SITE_URL}" style="color:#f46a20;">thecreativesroom.com</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    // Validate JWT with anon key
    const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: "Invalid token" }, 401);

    // Admin check via service role
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const subject = String(body.subject || "").trim();
    const intro = String(body.intro || "").trim();
    const theme = typeof body.theme === "string" ? body.theme.trim() : "";
    const subjectIsCustom = body.subjectIsCustom === true;
    const refs: RefInput[] = Array.isArray(body.refs) ? body.refs : [];
    const testEmail = typeof body.testEmail === "string" ? body.testEmail.trim() : null;
    const previewOnly = body.previewOnly === true;

    if (!subject) return json({ error: "Subject required" }, 400);
    if (refs.length === 0) return json({ error: "No references" }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY") ?? "";

    // Fetch live news once — shared by curation and content generation
    const headlines = theme ? "" : await fetchCurrentEvents();
    const contextLine = theme
      ? `The editor wants this week's newsletter to focus on: "${theme}". Prioritise references that connect to this theme.`
      : headlines
      ? `Here are today's top world headlines: ${headlines}\n\nUse these to identify what's culturally resonant right now. Pick refs that connect — by brand, industry, aesthetic, subject matter, or adjacent creative territory.`
      : `Think about the biggest cultural moments happening this week — film festivals, sports, award shows, fashion weeks, product launches — and pick refs that connect by brand, category, or vibe.`;

    const curatedRefs = apiKey ? await curateRefs(refs, apiKey, contextLine) : refs;
    const enriched = apiKey
      ? await generateEnrichedContent(curatedRefs, apiKey, contextLine)
      : { blurbs: {}, intro: "", subject: "" };

    const resolvedSubject = subjectIsCustom ? subject : (enriched.subject || subject);
    const resolvedIntro = intro || enriched.intro || "";

    if (previewOnly) {
      return json({ generatedSubject: enriched.subject, generatedIntro: enriched.intro, curatedCount: curatedRefs.length });
    }

    const html = buildHtml(curatedRefs, enriched.blurbs, resolvedSubject, resolvedIntro);
    const preview = `${curatedRefs.length} reference${curatedRefs.length === 1 ? "" : "s"} — hand-picked for you`;

    let emails: string[];
    if (testEmail) {
      emails = [testEmail];
    } else {
      const { data: users, error: usersErr } = await (supabase as any).rpc("get_user_overview");
      if (usersErr) return json({ error: usersErr.message }, 500);
      emails = (Array.isArray(users) ? users : [])
        .map((u: any) => u.email)
        .filter((e: any): e is string => typeof e === "string" && e.includes("@"));
    }

    if (emails.length === 0) return json({ error: "No emails found" }, 400);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ error: "RESEND_API_KEY not configured" }, 500);

    const from = Deno.env.get("NEWSLETTER_FROM") || "The Creatives Room <hello@thecreativesroom.com>";

    const BATCH = 100;
    let sent = 0;
    for (let i = 0; i < emails.length; i += BATCH) {
      const chunk = emails.slice(i, i + BATCH);
      const messages = chunk.map((to) => ({
        from,
        to,
        subject: resolvedSubject,
        html: `<div style="display:none;max-height:0;overflow:hidden;">${preview}</div>${html}`,
      }));

      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      });

      if (!res.ok) {
        const err = await res.text();
        return json({ error: `Resend error: ${err}`, sent }, res.status);
      }
      sent += chunk.length;
    }

    return json({ sent, generatedSubject: enriched.subject, generatedIntro: enriched.intro });
  } catch (e: any) {
    return json({ error: e?.message ?? "Unknown error" }, 500);
  }
});
