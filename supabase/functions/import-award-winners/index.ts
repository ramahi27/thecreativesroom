// Imports award-winning ad campaigns from YouTube as draft references for the admin user.
// Creates a folder per award and per year, attaches each draft to both folders.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AWARDS = [
  { folder: "Cannes Lions", queries: ["Cannes Lions Grand Prix", "Cannes Lions winner film"] },
  { folder: "D&AD", queries: ["D&AD Black Pencil winner", "D&AD Yellow Pencil winner"] },
  { folder: "One Show", queries: ["One Show Best of Discipline winner", "One Show Gold Pencil"] },
  { folder: "Clio", queries: ["Clio Awards Grand winner"] },
  { folder: "Epica", queries: ["Epica Awards Grand Prix winner"] },
  { folder: "ADC", queries: ["ADC Awards Black Cube winner"] },
  { folder: "LIA", queries: ["LIA Awards Grand winner"] },
];

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const RESULTS_PER_QUERY = 6; // ~12/award/year => trimmed by dedupe

type YTItem = {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    publishedAt: string;
    description: string;
  };
};

async function ytSearch(query: string, year: number, key: string): Promise<YTItem[]> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: String(RESULTS_PER_QUERY),
    q: `${query} ${year}`,
    publishedAfter: `${year}-01-01T00:00:00Z`,
    publishedBefore: `${year + 1}-06-30T00:00:00Z`,
    key,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!res.ok) {
    const txt = await res.text();
    console.error("YT search failed", res.status, txt);
    return [];
  }
  const data = await res.json();
  return (data.items || []) as YTItem[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY");
    if (!YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    // Verify admin
    const { data: roleRow } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service client for inserts (bypasses RLS, but we set created_by + user_id explicitly)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Build / fetch folders (per-award + per-year)
    const folderNames = [
      ...AWARDS.map((a) => a.folder),
      ...YEARS.map((y) => String(y)),
    ];
    const { data: existingFolders } = await admin
      .from("folders")
      .select("id,name")
      .eq("user_id", userId)
      .in("name", folderNames);
    const folderMap = new Map<string, string>();
    (existingFolders || []).forEach((f: any) => folderMap.set(f.name, f.id));

    let position = (existingFolders?.length || 0);
    const toCreate = folderNames.filter((n) => !folderMap.has(n));
    if (toCreate.length) {
      const rows = toCreate.map((name) => ({
        user_id: userId,
        name,
        position: position++,
        color: AWARDS.find((a) => a.folder === name) ? "#f59e0b" : "#3b82f6",
      }));
      const { data: created, error: cErr } = await admin
        .from("folders")
        .insert(rows)
        .select("id,name");
      if (cErr) throw cErr;
      (created || []).forEach((f: any) => folderMap.set(f.name, f.id));
    }

    // Gather videos
    const seen = new Map<string, { videoId: string; title: string; award: string; year: number; channel: string }>();
    let apiCalls = 0;
    for (const award of AWARDS) {
      for (const year of YEARS) {
        for (const q of award.queries) {
          apiCalls++;
          const items = await ytSearch(q, year, YOUTUBE_API_KEY);
          for (const it of items) {
            const vid = it.id?.videoId;
            if (!vid) continue;
            const key = `${vid}|${award.folder}|${year}`;
            if (seen.has(key)) continue;
            seen.set(key, {
              videoId: vid,
              title: it.snippet.title,
              award: award.folder,
              year,
              channel: it.snippet.channelTitle,
            });
          }
        }
      }
    }

    // Avoid re-importing existing source_urls
    const allUrls = Array.from(new Set(Array.from(seen.values()).map((v) => `https://www.youtube.com/watch?v=${v.videoId}`)));
    const { data: existingRefs } = await admin
      .from("references")
      .select("id,source_url")
      .in("source_url", allUrls);
    const urlToRefId = new Map<string, string>();
    (existingRefs || []).forEach((r: any) => urlToRefId.set(r.source_url, r.id));

    // Insert references in batches
    const toInsertRefs: any[] = [];
    for (const v of seen.values()) {
      const url = `https://www.youtube.com/watch?v=${v.videoId}`;
      if (urlToRefId.has(url)) continue;
      toInsertRefs.push({
        title: v.title.slice(0, 200),
        type: "video",
        source_url: url,
        thumbnail_url: `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`,
        brand: v.channel,
        year: v.year,
        tags: [v.award, String(v.year), "award-winner"],
        categories: [],
        media_items: [],
        notes: `Imported from YouTube — ${v.award} ${v.year}`,
        created_by: userId,
        published: false, // draft
        source: "youtube-import",
      });
    }

    let inserted: any[] = [];
    if (toInsertRefs.length) {
      // dedupe within batch by url
      const uniq = new Map<string, any>();
      for (const r of toInsertRefs) uniq.set(r.source_url, r);
      const arr = Array.from(uniq.values());
      const { data: ins, error: insErr } = await admin
        .from("references")
        .insert(arr)
        .select("id,source_url");
      if (insErr) throw insErr;
      inserted = ins || [];
      inserted.forEach((r: any) => urlToRefId.set(r.source_url, r.id));
    }

    // Build folder_items rows: each video goes to its award folder + year folder
    const folderItemRows: any[] = [];
    for (const v of seen.values()) {
      const url = `https://www.youtube.com/watch?v=${v.videoId}`;
      const refId = urlToRefId.get(url);
      if (!refId) continue;
      const awardFolderId = folderMap.get(v.award);
      const yearFolderId = folderMap.get(String(v.year));
      if (awardFolderId)
        folderItemRows.push({ user_id: userId, folder_id: awardFolderId, reference_id: refId });
      if (yearFolderId)
        folderItemRows.push({ user_id: userId, folder_id: yearFolderId, reference_id: refId });
    }

    if (folderItemRows.length) {
      // upsert via on-conflict do nothing
      const { error: fiErr } = await admin
        .from("folder_items")
        .upsert(folderItemRows, { onConflict: "folder_id,reference_id", ignoreDuplicates: true });
      if (fiErr) console.error("folder_items upsert error", fiErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        api_calls: apiCalls,
        videos_found: seen.size,
        new_drafts: inserted.length,
        folder_links: folderItemRows.length,
        folders: folderNames.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    console.error("import-award-winners error", e);
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
