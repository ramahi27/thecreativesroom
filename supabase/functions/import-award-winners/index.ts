// Imports a hand-curated list of award-winning ad campaigns as draft references
// for the admin user. Creates folders per award and per year, links each draft to both.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Pick = {
  award: string;
  year: number;
  title: string;
  brand: string;
  agency?: string;
  videoId: string; // YouTube video ID
};

// Curated list of well-known award winners (Cannes Lions Grand Prix, D&AD Black Pencils,
// One Show BoD, Clio Grand, Epica Grand Prix, ADC Black Cube, LIA Grand). Video IDs are
// official brand/agency uploads where possible.
const PICKS: Pick[] = [
  // ===== Cannes Lions =====
  { award: "Cannes Lions", year: 2024, title: "Heinz · It Has to Be Heinz", brand: "Heinz", agency: "Rethink", videoId: "RJjOaR-i4ZI" },
  { award: "Cannes Lions", year: 2024, title: "Pedigree · Adoptable", brand: "Pedigree", agency: "Colenso BBDO", videoId: "qTtCbNbcgkM" },
  { award: "Cannes Lions", year: 2023, title: "Apple · R.I.P. Leon", brand: "Apple", agency: "TBWA Media Arts Lab", videoId: "tnAYkS3pBlo" },
  { award: "Cannes Lions", year: 2023, title: "Specsavers · The Misheard Version", brand: "Specsavers", agency: "Golin", videoId: "X8uZ2lYC3iI" },
  { award: "Cannes Lions", year: 2022, title: "Decathlon · The Breakaway", brand: "Decathlon", agency: "BBDO Belgium", videoId: "C7C5d_4ZyEU" },
  { award: "Cannes Lions", year: 2022, title: "Apple · Escape from the Office", brand: "Apple", agency: "TBWA Media Arts Lab", videoId: "8aAxTOWi9hM" },
  { award: "Cannes Lions", year: 2021, title: "Burger King · Stevenage Challenge", brand: "Burger King", agency: "DAVID Madrid", videoId: "yfVlzu8B4Wk" },
  { award: "Cannes Lions", year: 2021, title: "Cheetos · Can't Touch This", brand: "Cheetos", agency: "Goodby Silverstein", videoId: "yz1H3pRcfpY" },
  { award: "Cannes Lions", year: 2020, title: "Nike · You Can't Stop Us", brand: "Nike", agency: "Wieden+Kennedy", videoId: "WA4dDs0T7sM" },
  { award: "Cannes Lions", year: 2019, title: "Nike · Dream Crazy", brand: "Nike", agency: "Wieden+Kennedy", videoId: "WW2yKSt2C_A" },
  { award: "Cannes Lions", year: 2019, title: "Burger King · The Whopper Detour", brand: "Burger King", agency: "FCB New York", videoId: "ywaVkTiF95M" },
  { award: "Cannes Lions", year: 2018, title: "Palau Pledge", brand: "Palau Legacy Project", agency: "Host/Havas", videoId: "FQXGSe_Zspk" },
  { award: "Cannes Lions", year: 2018, title: "Tide · It's a Tide Ad", brand: "Tide", agency: "Saatchi & Saatchi", videoId: "EOuolCkqkTw" },
  { award: "Cannes Lions", year: 2017, title: "Fearless Girl", brand: "State Street Global Advisors", agency: "McCann NY", videoId: "3kV3pj9o-FE" },
  { award: "Cannes Lions", year: 2017, title: "Boost Your Voice · Boost Mobile", brand: "Boost Mobile", agency: "180LA", videoId: "PLZ2_HwG7yo" },
  { award: "Cannes Lions", year: 2016, title: "REI · #OptOutside", brand: "REI", agency: "Venables Bell & Partners", videoId: "fvwXkj_ngQc" },
  { award: "Cannes Lions", year: 2016, title: "Geico · Unskippable Family", brand: "Geico", agency: "The Martin Agency", videoId: "5se9-i6CuVY" },

  // ===== D&AD =====
  { award: "D&AD", year: 2024, title: "Specsavers · The Misheard Version", brand: "Specsavers", agency: "Golin", videoId: "X8uZ2lYC3iI" },
  { award: "D&AD", year: 2023, title: "Nike · Footballverse", brand: "Nike", agency: "Wieden+Kennedy", videoId: "8w7e_eA62fk" },
  { award: "D&AD", year: 2023, title: "Apple · R.I.P. Leon", brand: "Apple", agency: "TBWA Media Arts Lab", videoId: "tnAYkS3pBlo" },
  { award: "D&AD", year: 2022, title: "Channel 4 · Super. Human.", brand: "Channel 4", agency: "4Creative", videoId: "RKR-_-l-V_I" },
  { award: "D&AD", year: 2021, title: "Burger King · Moldy Whopper", brand: "Burger King", agency: "INGO/David", videoId: "_PpyYvc4QSI" },
  { award: "D&AD", year: 2020, title: "Nike · Dream Crazier", brand: "Nike", agency: "Wieden+Kennedy", videoId: "whpJ19RJ4JY" },
  { award: "D&AD", year: 2019, title: "Apple · Welcome Home", brand: "Apple", agency: "TBWA Media Arts Lab", videoId: "Q4HnJgKuRfg" },
  { award: "D&AD", year: 2018, title: "Channel 4 · We're the Superhumans", brand: "Channel 4", agency: "4Creative", videoId: "IocLkk3aYlk" },
  { award: "D&AD", year: 2017, title: "Honda · The Other Side", brand: "Honda", agency: "Wieden+Kennedy London", videoId: "befHIne1Ymg" },
  { award: "D&AD", year: 2016, title: "Always · #LikeAGirl", brand: "Always", agency: "Leo Burnett", videoId: "XjJQBjWYDTs" },

  // ===== One Show =====
  { award: "One Show", year: 2024, title: "Coors Light · Lights Out", brand: "Coors Light", agency: "DDB Chicago", videoId: "WVTwQ24sQOk" },
  { award: "One Show", year: 2023, title: "Heinz · Draw Ketchup", brand: "Heinz", agency: "Rethink", videoId: "9oOyDx_xk_M" },
  { award: "One Show", year: 2022, title: "Apple · The Underdogs: Swiped Away", brand: "Apple", agency: "TBWA Media Arts Lab", videoId: "MRzy6McPnNE" },
  { award: "One Show", year: 2021, title: "Heinz · Ketchup & Friends", brand: "Heinz", agency: "Rethink", videoId: "uMEZuvrlb9Q" },
  { award: "One Show", year: 2020, title: "IKEA · ThisAbles", brand: "IKEA Israel", agency: "McCann Tel Aviv", videoId: "GgvUjtPMCC0" },
  { award: "One Show", year: 2019, title: "Nike · Dream Crazy", brand: "Nike", agency: "Wieden+Kennedy", videoId: "WW2yKSt2C_A" },
  { award: "One Show", year: 2018, title: "Sandy Hook Promise · Evan", brand: "Sandy Hook Promise", agency: "BBDO NY", videoId: "A8syQeFtBKc" },
  { award: "One Show", year: 2017, title: "Adidas · Original Is Never Finished", brand: "Adidas", agency: "Johannes Leonardo", videoId: "BHS3-OnGqr0" },
  { award: "One Show", year: 2016, title: "Geico · Unskippable Family", brand: "Geico", agency: "The Martin Agency", videoId: "5se9-i6CuVY" },

  // ===== Clio =====
  { award: "Clio", year: 2024, title: "Pop-Tarts Bowl · The First Edible Mascot", brand: "Pop-Tarts", agency: "Weber Shandwick", videoId: "u3-kf-CMlhU" },
  { award: "Clio", year: 2023, title: "Heinz · Ketchup Fraud", brand: "Heinz", agency: "Rethink", videoId: "Ji5_mqicxso" },
  { award: "Clio", year: 2022, title: "Burger King · Confusing Times", brand: "Burger King", agency: "DAVID Madrid", videoId: "vqV2Ne_eDSU" },
  { award: "Clio", year: 2021, title: "Apple · Whole Working-From-Home Thing", brand: "Apple", agency: "TBWA Media Arts Lab", videoId: "9aoPMpu2dT0" },
  { award: "Clio", year: 2020, title: "Sandy Hook Promise · Back-to-School Essentials", brand: "Sandy Hook Promise", agency: "BBDO NY", videoId: "9Cb1Pa5PLZM" },
  { award: "Clio", year: 2019, title: "Nike · Dream Crazy", brand: "Nike", agency: "Wieden+Kennedy", videoId: "WW2yKSt2C_A" },
  { award: "Clio", year: 2018, title: "Tide · It's a Tide Ad", brand: "Tide", agency: "Saatchi & Saatchi", videoId: "EOuolCkqkTw" },
  { award: "Clio", year: 2017, title: "Fearless Girl", brand: "State Street", agency: "McCann NY", videoId: "3kV3pj9o-FE" },
  { award: "Clio", year: 2016, title: "Old Spice · The Man Your Man Could Smell Like", brand: "Old Spice", agency: "Wieden+Kennedy", videoId: "owGykVbfgUE" },

  // ===== Epica =====
  { award: "Epica", year: 2023, title: "Apple · R.I.P. Leon", brand: "Apple", agency: "TBWA Media Arts Lab", videoId: "tnAYkS3pBlo" },
  { award: "Epica", year: 2022, title: "Apple · Escape from the Office", brand: "Apple", agency: "TBWA Media Arts Lab", videoId: "8aAxTOWi9hM" },
  { award: "Epica", year: 2021, title: "Decathlon · The Breakaway", brand: "Decathlon", agency: "BBDO Belgium", videoId: "C7C5d_4ZyEU" },
  { award: "Epica", year: 2020, title: "Burger King · Moldy Whopper", brand: "Burger King", agency: "INGO/David", videoId: "_PpyYvc4QSI" },
  { award: "Epica", year: 2019, title: "Nike · Dream Crazy", brand: "Nike", agency: "Wieden+Kennedy", videoId: "WW2yKSt2C_A" },
  { award: "Epica", year: 2018, title: "Palau Pledge", brand: "Palau Legacy Project", agency: "Host/Havas", videoId: "FQXGSe_Zspk" },
  { award: "Epica", year: 2017, title: "Channel 4 · We're the Superhumans", brand: "Channel 4", agency: "4Creative", videoId: "IocLkk3aYlk" },
  { award: "Epica", year: 2016, title: "Always · #LikeAGirl", brand: "Always", agency: "Leo Burnett", videoId: "XjJQBjWYDTs" },

  // ===== ADC =====
  { award: "ADC", year: 2024, title: "Heinz · It Has to Be Heinz", brand: "Heinz", agency: "Rethink", videoId: "RJjOaR-i4ZI" },
  { award: "ADC", year: 2023, title: "Apple · R.I.P. Leon", brand: "Apple", agency: "TBWA Media Arts Lab", videoId: "tnAYkS3pBlo" },
  { award: "ADC", year: 2022, title: "Apple · Escape from the Office", brand: "Apple", agency: "TBWA Media Arts Lab", videoId: "8aAxTOWi9hM" },
  { award: "ADC", year: 2021, title: "Burger King · Moldy Whopper", brand: "Burger King", agency: "INGO/David", videoId: "_PpyYvc4QSI" },
  { award: "ADC", year: 2020, title: "Nike · You Can't Stop Us", brand: "Nike", agency: "Wieden+Kennedy", videoId: "WA4dDs0T7sM" },
  { award: "ADC", year: 2019, title: "Apple · Welcome Home", brand: "Apple", agency: "TBWA Media Arts Lab", videoId: "Q4HnJgKuRfg" },
  { award: "ADC", year: 2018, title: "Sandy Hook Promise · Evan", brand: "Sandy Hook Promise", agency: "BBDO NY", videoId: "A8syQeFtBKc" },
  { award: "ADC", year: 2017, title: "Honda · The Other Side", brand: "Honda", agency: "Wieden+Kennedy London", videoId: "befHIne1Ymg" },
  { award: "ADC", year: 2016, title: "Geico · Unskippable Family", brand: "Geico", agency: "The Martin Agency", videoId: "5se9-i6CuVY" },

  // ===== LIA =====
  { award: "LIA", year: 2024, title: "Pedigree · Adoptable", brand: "Pedigree", agency: "Colenso BBDO", videoId: "qTtCbNbcgkM" },
  { award: "LIA", year: 2023, title: "Heinz · Ketchup Fraud", brand: "Heinz", agency: "Rethink", videoId: "Ji5_mqicxso" },
  { award: "LIA", year: 2022, title: "Decathlon · The Breakaway", brand: "Decathlon", agency: "BBDO Belgium", videoId: "C7C5d_4ZyEU" },
  { award: "LIA", year: 2021, title: "Burger King · Stevenage Challenge", brand: "Burger King", agency: "DAVID Madrid", videoId: "yfVlzu8B4Wk" },
  { award: "LIA", year: 2020, title: "Nike · You Can't Stop Us", brand: "Nike", agency: "Wieden+Kennedy", videoId: "WA4dDs0T7sM" },
  { award: "LIA", year: 2019, title: "Nike · Dream Crazy", brand: "Nike", agency: "Wieden+Kennedy", videoId: "WW2yKSt2C_A" },
  { award: "LIA", year: 2018, title: "Tide · It's a Tide Ad", brand: "Tide", agency: "Saatchi & Saatchi", videoId: "EOuolCkqkTw" },
  { award: "LIA", year: 2017, title: "Fearless Girl", brand: "State Street", agency: "McCann NY", videoId: "3kV3pj9o-FE" },
  { award: "LIA", year: 2016, title: "Always · #LikeAGirl", brand: "Always", agency: "Leo Burnett", videoId: "XjJQBjWYDTs" },
];

const AWARD_NAMES = Array.from(new Set(PICKS.map((p) => p.award)));
const YEAR_NAMES = Array.from(new Set(PICKS.map((p) => String(p.year)))).sort();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Folders
    const folderNames = [...AWARD_NAMES, ...YEAR_NAMES];
    const { data: existing } = await admin
      .from("folders")
      .select("id,name")
      .eq("user_id", userId)
      .in("name", folderNames);
    const folderMap = new Map<string, string>();
    (existing || []).forEach((f: any) => folderMap.set(f.name, f.id));

    let position = existing?.length || 0;
    const toCreate = folderNames.filter((n) => !folderMap.has(n));
    if (toCreate.length) {
      const rows = toCreate.map((name) => ({
        user_id: userId,
        name,
        position: position++,
        color: AWARD_NAMES.includes(name) ? "#f59e0b" : "#3b82f6",
      }));
      const { data: created, error: cErr } = await admin
        .from("folders")
        .insert(rows)
        .select("id,name");
      if (cErr) throw cErr;
      (created || []).forEach((f: any) => folderMap.set(f.name, f.id));
    }

    // Existing references (avoid duplicates by source_url)
    const allUrls = Array.from(new Set(PICKS.map((p) => `https://www.youtube.com/watch?v=${p.videoId}`)));
    const { data: existingRefs } = await admin
      .from("references")
      .select("id,source_url")
      .in("source_url", allUrls);
    const urlToRefId = new Map<string, string>();
    (existingRefs || []).forEach((r: any) => urlToRefId.set(r.source_url, r.id));

    // Build inserts (one row per unique videoId; merge titles/awards via tags)
    const byVideo = new Map<string, Pick[]>();
    for (const p of PICKS) {
      const arr = byVideo.get(p.videoId) || [];
      arr.push(p);
      byVideo.set(p.videoId, arr);
    }

    const toInsertRefs: any[] = [];
    for (const [vid, picks] of byVideo) {
      const url = `https://www.youtube.com/watch?v=${vid}`;
      if (urlToRefId.has(url)) continue;
      const first = picks[0];
      const awards = Array.from(new Set(picks.map((p) => p.award)));
      const years = Array.from(new Set(picks.map((p) => p.year)));
      toInsertRefs.push({
        title: first.title,
        type: "video",
        source_url: url,
        thumbnail_url: `https://img.youtube.com/vi/${vid}/hqdefault.jpg`,
        brand: first.brand,
        agency: first.agency || null,
        year: Math.max(...years),
        tags: [...awards, ...years.map(String), "award-winner"],
        categories: [],
        media_items: [],
        notes: `Award winner — ${awards.join(", ")} (${years.join(", ")})`,
        created_by: userId,
        published: false,
        source: "curated-import",
      });
    }

    let inserted: any[] = [];
    if (toInsertRefs.length) {
      const { data: ins, error: insErr } = await admin
        .from("references")
        .insert(toInsertRefs)
        .select("id,source_url");
      if (insErr) throw insErr;
      inserted = ins || [];
      inserted.forEach((r: any) => urlToRefId.set(r.source_url, r.id));
    }

    // Folder links
    const folderItemRows: any[] = [];
    for (const p of PICKS) {
      const refId = urlToRefId.get(`https://www.youtube.com/watch?v=${p.videoId}`);
      if (!refId) continue;
      const awardId = folderMap.get(p.award);
      const yearId = folderMap.get(String(p.year));
      if (awardId) folderItemRows.push({ user_id: userId, folder_id: awardId, reference_id: refId });
      if (yearId) folderItemRows.push({ user_id: userId, folder_id: yearId, reference_id: refId });
    }

    if (folderItemRows.length) {
      const { error: fiErr } = await admin
        .from("folder_items")
        .upsert(folderItemRows, { onConflict: "folder_id,reference_id", ignoreDuplicates: true });
      if (fiErr) console.error("folder_items upsert error", fiErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        unique_videos: byVideo.size,
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
