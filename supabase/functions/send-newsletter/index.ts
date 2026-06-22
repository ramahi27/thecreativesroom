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
      // Extract video id from /vi/<id>/...
      const m = url.match(/\/vi\/([^/]+)\//);
      if (m) {
        const id = m[1];
        const maxres = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
        const sd = `https://i.ytimg.com/vi/${id}/sddefault.jpg`;
        const hq = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
        // wsrv `errorredirect` falls back if the primary 404s
        return `https://wsrv.nl/?url=${encodeURIComponent(maxres)}&w=1200&output=jpg&q=90&errorredirect=${encodeURIComponent(
          `https://wsrv.nl/?url=${sd}&w=1200&output=jpg&q=90&errorredirect=${encodeURIComponent(
            `https://wsrv.nl/?url=${hq}&w=1200&output=jpg&q=90`,
          )}`,
        )}`;
      }
      return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=1200&output=jpg&q=90`;
    }
    if (host.includes("vumbnail.com")) {
      // vumbnail.com/<id>.jpg → vumbnail.com/<id>_large.jpg (640w) is the largest reliable size
      const large = url.replace(/(\/[^/]+?)(_(?:small|medium|large))?\.jpg$/, "$1_large.jpg");
      return `https://wsrv.nl/?url=${encodeURIComponent(large)}&w=1200&output=jpg&q=90`;
    }
    if (host.includes("vimeocdn.com")) {
      return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=1200&output=jpg&q=90`;
    }
  } catch { /* noop */ }
  return url;
}

async function curateRefs(refs: RefInput[], apiKey: string, theme?: string): Promise<RefInput[]> {
  if (refs.length <= 8) return refs;

  const today = new Date().toISOString().split("T")[0];
  const list = refs.map((r, i) =>
    `${i + 1}. "${r.title}"${r.brand ? ` by ${r.brand}` : ""}${r.year ? ` (${r.year})` : ""}${r.categories?.[0] ? ` [${r.categories[0]}]` : ""}${r.visual_summary ? ` — ${r.visual_summary.slice(0, 100)}` : ""}`
  ).join("\n");

  const focusLine = theme
    ? `The editor wants this week's newsletter to focus on: "${theme}". Prioritise references that connect to this theme.`
    : `Pick refs most relevant to major world events, cultural moments, award seasons, sports, film festivals, fashion weeks, or trending topics happening right now.`;

  const prompt = `You are curating a weekly creative newsletter. Today is ${today}.

${focusLine}

Rules:
- Pick exactly 8–10 references total
- At least 6–7 must be from 2026 (recent work feels timely)
- At most 2 can be "classics" (older work that still earns its place by being exceptionally relevant to the theme)
- Rank by relevance — most relevant first

References:
${list}

Return ONLY a JSON array of 1-based indices in order of relevance. Example: [3, 7, 1, 5, 2]`;

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
    if (!match) return refs.slice(0, 7);
    const indices: number[] = JSON.parse(match[0]);
    const curated = indices
      .filter((i) => i >= 1 && i <= refs.length)
      .map((i) => refs[i - 1]);
    return curated.length >= 3 ? curated : refs.slice(0, 10);
  } catch {
    return refs.slice(0, 7);
  }
}

async function generateBlurbs(refs: RefInput[], apiKey: string): Promise<Record<string, string>> {
  const list = refs.map((r, i) =>
    `${i + 1}. "${r.title}"${r.brand ? ` by ${r.brand}` : ""}${r.categories?.[0] ? ` [${r.categories[0]}]` : ""}${r.visual_summary ? ` — context: ${r.visual_summary}` : ""}`
  ).join("\n");

  const prompt = `You are writing a creative newsletter for a reference archive called The Creatives Room. For each reference below, write ONE punchy sentence (max 18 words) that makes readers excited to click. Rules: do NOT start with or repeat the title, be specific and evocative, sound like a creative director recommending work to their team, no filler phrases like "this is" or "a must-see".

References:
${list}

Return ONLY a JSON object like: { "1": "...", "2": "...", ... }`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
    }),
  });

  if (!res.ok) return {};
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    return JSON.parse(match[0]);
  } catch {
    return {};
  }
}

function buildHtml(refs: RefInput[], blurbs: Record<string, string>, subject: string, intro = ""): string {
  const rows = refs.map((r, i) => {
    const url = refUrl(r);
    const blurb = blurbs[String(i + 1)] || "";
    const thumb = r.thumbnail_url
      ? `<img src="${emailThumb(r.thumbnail_url)}" alt="${r.title.replace(/"/g, "&quot;")}" width="560" style="width:100%;max-width:560px;display:block;border-radius:8px 8px 0 0;" />`
      : `<div style="width:100%;height:80px;background:#1a1a1a;border-radius:8px 8px 0 0;"></div>`;
    const meta = [r.brand, r.categories?.[0]].filter(Boolean).join(" · ");
    return `
<tr><td style="padding:0 0 28px 0;">
  <a href="${url}" style="display:block;text-decoration:none;background:#111;border-radius:10px;overflow:hidden;border:1px solid #222;">
    ${thumb}
    <div style="padding:18px 22px 20px;">
      ${meta ? `<p style="margin:0 0 6px 0;font-family:monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.15em;color:#f46a20;">${meta}</p>` : ""}
      <p style="margin:0 0 8px 0;font-family:Georgia,serif;font-size:20px;font-weight:700;color:#f5f0e8;line-height:1.25;">${r.title}</p>
      ${blurb ? `<p style="margin:0;font-family:Georgia,serif;font-size:14px;color:#999;line-height:1.55;font-style:italic;">${blurb}</p>` : ""}
    </div>
  </a>
</td></tr>`;
  }).join("");

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
            ${rows}
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
    const theme = typeof body.theme === "string" ? body.theme.trim() : undefined;
    const refs: RefInput[] = Array.isArray(body.refs) ? body.refs : [];
    const testEmail = typeof body.testEmail === "string" ? body.testEmail.trim() : null;

    if (!subject) return json({ error: "Subject required" }, 400);
    if (refs.length === 0) return json({ error: "No references" }, 400);

    // Curate most world-relevant refs, then generate AI blurbs
    const apiKey = Deno.env.get("LOVABLE_API_KEY") ?? "";
    const curatedRefs = apiKey ? await curateRefs(refs, apiKey, theme) : refs;
    const blurbs = apiKey ? await generateBlurbs(curatedRefs, apiKey) : {};

    const html = buildHtml(curatedRefs, blurbs, subject, intro);
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
        subject,
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

    return json({ sent });
  } catch (e: any) {
    return json({ error: e?.message ?? "Unknown error" }, 500);
  }
});
