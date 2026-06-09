import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_VIDEO = ["Commercials", "Promos / Trailers", "Case Studies", "Social Content"];
const DEFAULT_PHOTO = ["Campaign", "Branding", "Copy Driven"];
const MIN_REFS = 20;

export function useCategories() {
  const [video, setVideo] = useState<string[]>(DEFAULT_VIDEO);
  const [photo, setPhoto] = useState<string[]>(DEFAULT_PHOTO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const [settingsRes, refsRes] = await Promise.all([
        supabase
          .from("app_settings")
          .select("key, value")
          .in("key", ["video_categories", "photo_categories"]),
        supabase
          .from("references")
          .select("categories")
          .eq("published", true),
      ]);
      if (!active) return;

      // Count references per category
      const counts: Record<string, number> = {};
      for (const row of (refsRes.data || []) as any[]) {
        for (const cat of (row.categories || [])) {
          counts[cat] = (counts[cat] || 0) + 1;
        }
      }
      const meetsMin = (cats: string[]) =>
        refsRes.data ? cats.filter((c) => (counts[c] ?? 0) >= MIN_REFS) : cats;

      const map = new Map((settingsRes.data || []).map((r: any) => [r.key, r.value]));
      const v = map.get("video_categories");
      const p = map.get("photo_categories");
      if (Array.isArray(v)) setVideo(meetsMin(v as string[]));
      else setVideo(meetsMin(DEFAULT_VIDEO));
      if (Array.isArray(p)) setPhoto(meetsMin(p as string[]));
      else setPhoto(meetsMin(DEFAULT_PHOTO));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return { video, photo, all: [...video, ...photo], loading };
}
