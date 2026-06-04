// Pinterest board importer — fetches a public Pinterest board, groups related pins
// into single multi-image projects, and inserts them as drafts (published=false)
// into public.references using the media_items JSONB column.
//
// Streams NDJSON progress events back to the client (one JSON object per line):
//   { type: "progress" | "warn" | "done" | "error", ... }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Pin = {
  pin_id: string;
  title: string;
  description: string;
  image_url: string;
  source_url: string | null;
  source_domain: string | null;
  dominant_color: string | null;
};

type Group = {
  pins: Pin[];
  campaign_name?: string;
  reason: "same-url" | "domain+title" | "ai" | "single";
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function parseBoardUrl(input: string): { username: string; board: string } | null {
  try {
    const u = new URL(input);
    if (!u.hostname.includes("pinterest")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { username: parts[0], board: parts[1] };
  } catch {
    return null;
  }
}

function hostnameOf(u: string | null): string | null {
  if (!u) return null;
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// --- Fetch pins -------------------------------------------------------------

async function fetchPinsViaRss(
  username: string,
  board: string,
): Promise<Pin[]> {
  const url = `https://www.pinterest.com/${username}/${board}.rss`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return [];
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const pins: Pin[] = [];
  for (const m of items) {
    const block = m[1];
    const get = (tag: string) => {
      const r = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(block);
      if (!r) return "";
      return r[1]
        .replace(/<!\[CDATA\[/g, "")
        .replace(/\]\]>/g, "")
        .trim();
    };
    const title = get("title");
    const descriptionHtml = get("description");
    const link = get("link");
    // Pin link from Pinterest looks like https://www.pinterest.com/pin/<id>/
    const pinIdMatch = /\/pin\/(\d+)/.exec(link);
    const pinId = pinIdMatch ? pinIdMatch[1] : link;
    // <img src="..."> inside description
    const imgMatch = /<img[^>]+src=["']([^"']+)["']/.exec(descriptionHtml);
    const image = imgMatch ? imgMatch[1].replace(/\/\d+x\//, "/originals/") : "";
    const description = descriptionHtml.replace(/<[^>]+>/g, "").trim();
    if (!image) continue;
    pins.push({
      pin_id: pinId,
      title: title || description.slice(0, 80) || "Untitled pin",
      description,
      image_url: image,
      source_url: null, // RSS does not expose external link
      source_domain: null,
      dominant_color: null,
    });
  }
  return pins;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");
}

async function fetchPinsViaHtml(
  username: string,
  board: string,
): Promise<Pin[]> {
  const url = `https://www.pinterest.com/${username}/${board}/`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return [];
  const html = await res.text();

  // Try a few common embedded JSON containers.
  const candidates = [
    /<script id="__PWS_DATA__"[^>]*>([\s\S]*?)<\/script>/,
    /<script id="initial-state"[^>]*>([\s\S]*?)<\/script>/,
    /<script[^>]*>\s*window\.__PWS_INITIAL_PROPS__\s*=\s*([\s\S]*?);\s*<\/script>/,
  ];
  let json: any = null;
  for (const re of candidates) {
    const m = re.exec(html);
    if (m) {
      try {
        json = JSON.parse(decodeHtml(m[1]));
        break;
      } catch {
        // ignore
      }
    }
  }

  const pins: Pin[] = [];
  const seen = new Set<string>();

  function visit(node: any) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const x of node) visit(x);
      return;
    }
    // Heuristic: a pin object has an `id` and either `images.orig` or `image_signature`.
    if (
      typeof node.id === "string" &&
      node.images &&
      typeof node.images === "object"
    ) {
      const id = node.id as string;
      if (!seen.has(id)) {
        const orig =
          node.images.orig?.url ||
          node.images["736x"]?.url ||
          node.images["564x"]?.url ||
          null;
        if (orig) {
          seen.add(id);
          pins.push({
            pin_id: id,
            title:
              node.grid_title ||
              node.title ||
              node.rich_summary?.display_name ||
              (node.description || "").slice(0, 80) ||
              "Untitled pin",
            description: node.description || node.auto_alt_text || "",
            image_url: orig,
            source_url: node.link || node.rich_summary?.url || null,
            source_domain:
              node.domain ||
              hostnameOf(node.link || node.rich_summary?.url || null),
            dominant_color: node.dominant_color || null,
          });
        }
      }
    }
    for (const k of Object.keys(node)) visit(node[k]);
  }
  if (json) visit(json);

  // Last-resort regex over raw HTML for "orig":{"url":"..."}
  if (pins.length === 0) {
    const re = /"orig":\s*\{[^}]*?"url":"([^"]+)"/g;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(html))) {
      const url = m[1].replace(/\\u002F/g, "/");
      const id = `html-${i++}`;
      if (seen.has(url)) continue;
      seen.add(url);
      pins.push({
        pin_id: id,
        title: "Pinterest pin",
        description: "",
        image_url: url,
        source_url: null,
        source_domain: null,
        dominant_color: null,
      });
    }
  }

  return pins;
}

// --- Grouping ---------------------------------------------------------------

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function groupBySourceUrl(pins: Pin[]): { groups: Group[]; rest: Pin[] } {
  const map = new Map<string, Pin[]>();
  const rest: Pin[] = [];
  for (const p of pins) {
    if (p.source_url) {
      const key = p.source_url.split("#")[0].split("?")[0];
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    } else {
      rest.push(p);
    }
  }
  const groups: Group[] = [];
  for (const [, list] of map) {
    if (list.length > 1) {
      groups.push({ pins: list, reason: "same-url" });
    } else {
      rest.push(list[0]);
    }
  }
  return { groups, rest };
}

function groupByDomainAndTitle(pins: Pin[]): { groups: Group[]; rest: Pin[] } {
  const used = new Set<number>();
  const groups: Group[] = [];
  for (let i = 0; i < pins.length; i++) {
    if (used.has(i)) continue;
    const a = pins[i];
    if (!a.source_domain) continue;
    const aTok = tokenize(a.title + " " + a.description);
    const cluster: Pin[] = [a];
    const clusterIdx = [i];
    for (let j = i + 1; j < pins.length; j++) {
      if (used.has(j)) continue;
      const b = pins[j];
      if (b.source_domain !== a.source_domain) continue;
      const bTok = tokenize(b.title + " " + b.description);
      if (jaccard(aTok, bTok) >= 0.6) {
        cluster.push(b);
        clusterIdx.push(j);
      }
    }
    if (cluster.length > 1) {
      clusterIdx.forEach((idx) => used.add(idx));
      groups.push({ pins: cluster, reason: "domain+title" });
    }
  }
  const rest = pins.filter((_, i) => !used.has(i));
  return { groups, rest };
}

async function groupWithAi(pins: Pin[]): Promise<Group[]> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey || pins.length < 2) {
    return pins.map((p) => ({ pins: [p], reason: "single" as const }));
  }
  const list = pins
    .map(
      (p, i) =>
        `${i}. title="${(p.title || "").slice(0, 120)}" desc="${(p.description || "")
          .slice(0, 200)
          .replace(/\n/g, " ")}"`,
    )
    .join("\n");
  const prompt =
    "Here are pin titles and descriptions from a Pinterest board. " +
    "Group them by campaign — pins that are clearly from the same advertising " +
    "campaign, photoshoot, or design project should be grouped together. " +
    "Pins not part of any group should each be their own single-item group. " +
    "Reply ONLY with JSON, no prose, no markdown fences.\n\nPINS:\n" +
    list;
  try {
    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "user", content: prompt }],
          tools: [
            {
              type: "function",
              function: {
                name: "return_groups",
                description: "Return campaign groupings",
                parameters: {
                  type: "object",
                  properties: {
                    groups: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          campaign_name: { type: "string" },
                          pin_indices: {
                            type: "array",
                            items: { type: "number" },
                          },
                        },
                        required: ["campaign_name", "pin_indices"],
                      },
                    },
                  },
                  required: ["groups"],
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "return_groups" },
          },
        }),
      },
    );
    if (!resp.ok) throw new Error(`AI gateway ${resp.status}`);
    const data = await resp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = call ? JSON.parse(call.function.arguments) : null;
    const aiGroups: { campaign_name: string; pin_indices: number[] }[] =
      args?.groups || [];
    const used = new Set<number>();
    const out: Group[] = [];
    for (const g of aiGroups) {
      const idxs = (g.pin_indices || []).filter(
        (i) => Number.isInteger(i) && i >= 0 && i < pins.length && !used.has(i),
      );
      if (idxs.length === 0) continue;
      idxs.forEach((i) => used.add(i));
      const groupPins = idxs.map((i) => pins[i]);
      out.push({
        pins: groupPins,
        campaign_name: g.campaign_name,
        reason: idxs.length > 1 ? "ai" : "single",
      });
    }
    // Any pin the model omitted becomes a single
    for (let i = 0; i < pins.length; i++) {
      if (!used.has(i)) out.push({ pins: [pins[i]], reason: "single" });
    }
    return out;
  } catch {
    return pins.map((p) => ({ pins: [p], reason: "single" as const }));
  }
}

// --- Build references --------------------------------------------------------

function extractYear(text: string): number | null {
  const m = /\b(19[8-9]\d|20[0-4]\d)\b/.exec(text);
  return m ? parseInt(m[1], 10) : null;
}

function pickTitle(group: Group): string {
  if (group.campaign_name && group.pins.length > 1) return group.campaign_name;
  const longest = [...group.pins].sort(
    (a, b) => (b.title?.length || 0) - (a.title?.length || 0),
  )[0];
  return longest?.title || "Untitled";
}

function brandFromDomain(domain: string | null): string | null {
  if (!domain) return null;
  const root = domain.replace(/^www\./, "").split(".")[0];
  if (!root) return null;
  return root.charAt(0).toUpperCase() + root.slice(1);
}

function buildReference(group: Group, userId: string) {
  const first = group.pins[0];
  const sourceUrls = Array.from(
    new Set(group.pins.map((p) => p.source_url).filter(Boolean) as string[]),
  );
  const allText = group.pins
    .map((p) => `${p.title}\n${p.description}`)
    .join("\n");
  const year = extractYear(allText);
  const domain = group.pins.find((p) => p.source_domain)?.source_domain || null;
  const media_items = group.pins.map((p) => ({
    url: p.image_url,
    kind: "image" as const,
  }));
  return {
    title: pickTitle(group),
    type: "image" as const,
    media_url: first.image_url,
    thumbnail_url: first.image_url,
    source_url: sourceUrls[0] || null,
    brand: brandFromDomain(domain),
    agency: null,
    year,
    tags: ["pinterest", "imported"],
    categories: [] as string[],
    notes:
      group.pins.length > 1
        ? `Imported from Pinterest — ${group.pins.length} related pins grouped (${group.reason})` +
          (sourceUrls.length > 1
            ? `\nSources: ${sourceUrls.join(", ")}`
            : "")
        : "Imported from Pinterest",
    media_items,
    published: false,
    source: "pinterest",
    created_by: userId,
  };
}

// --- Streaming server --------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) =>
        controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));

      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const authHeader = req.headers.get("Authorization") || "";

        // Verify user via JWT (admin-only operation)
        const userClient = createClient(supabaseUrl, serviceKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: userRes } = await userClient.auth.getUser();
        const user = userRes?.user;
        if (!user) {
          send({ type: "error", message: "Not authenticated" });
          controller.close();
          return;
        }
        const { data: isAdmin } = await userClient.rpc("has_role", {
          _user_id: user.id,
          _role: "admin",
        });
        if (!isAdmin) {
          send({ type: "error", message: "Admin only" });
          controller.close();
          return;
        }

        const body = await req.json();
        const boardUrl: string = body?.boardUrl || "";
        const parsed = parseBoardUrl(boardUrl);
        if (!parsed) {
          send({ type: "error", message: "Invalid Pinterest board URL" });
          controller.close();
          return;
        }

        send({
          type: "progress",
          message: `Fetching board: ${parsed.username}/${parsed.board}`,
        });

        // Try HTML scrape first (richer data: source_url, domain), fall back to RSS.
        let pins = await fetchPinsViaHtml(parsed.username, parsed.board);
        if (pins.length === 0) {
          send({
            type: "progress",
            message: "HTML scrape empty — trying RSS feed",
          });
          pins = await fetchPinsViaRss(parsed.username, parsed.board);
        }

        if (pins.length === 0) {
          send({
            type: "error",
            message:
              "Could not fetch any pins. The board may be private, empty, or Pinterest changed its markup.",
          });
          controller.close();
          return;
        }

        send({ type: "progress", message: `Found ${pins.length} pins` });
        send({ type: "progress", message: "Grouping related pins…" });

        const { groups: urlGroups, rest: afterUrl } = groupBySourceUrl(pins);
        const { groups: titleGroups, rest: afterTitle } =
          groupByDomainAndTitle(afterUrl);

        let aiGroups: Group[] = [];
        if (afterTitle.length > 0) {
          send({
            type: "progress",
            message: `Asking AI to group remaining ${afterTitle.length} pins…`,
          });
          aiGroups = await groupWithAi(afterTitle);
        }

        const allGroups: Group[] = [...urlGroups, ...titleGroups, ...aiGroups];
        const autoGroupedByUrl = urlGroups.length;
        const groupedByAi = aiGroups.filter((g) => g.pins.length > 1).length;
        const singles = allGroups.filter((g) => g.pins.length === 1).length;

        send({
          type: "progress",
          message: `${pins.length} pins grouped into ${allGroups.length} projects`,
        });
        send({ type: "progress", message: "Sending to review queue…" });

        const admin = createClient(supabaseUrl, serviceKey);
        const rows = allGroups.map((g) => buildReference(g, user.id));
        // Insert in chunks of 50
        let inserted = 0;
        for (let i = 0; i < rows.length; i += 50) {
          const slice = rows.slice(i, i + 50);
          const { error, count } = await admin
            .from("references")
            .insert(slice, { count: "exact" });
          if (error) {
            send({
              type: "warn",
              message: `Insert chunk failed: ${error.message}`,
            });
          } else {
            inserted += count || slice.length;
          }
        }

        send({
          type: "done",
          summary: {
            total_pins: pins.length,
            projects: allGroups.length,
            inserted,
            auto_grouped_by_url: autoGroupedByUrl,
            grouped_by_title: titleGroups.length,
            grouped_by_ai: groupedByAi,
            single_pins: singles,
          },
        });
      } catch (e) {
        send({
          type: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
});
