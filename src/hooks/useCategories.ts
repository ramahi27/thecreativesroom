import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_VIDEO = ["Commercials", "Promos / Trailers", "Case Studies", "Social Content"];
const DEFAULT_PHOTO = ["Campaign", "Branding", "Copy Driven"];

export function useCategories() {
  const [video, setVideo] = useState<string[]>(DEFAULT_VIDEO);
  const [photo, setPhoto] = useState<string[]>(DEFAULT_PHOTO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["video_categories", "photo_categories"]);
      if (!active) return;
      const map = new Map((data || []).map((r: any) => [r.key, r.value]));
      const v = map.get("video_categories");
      const p = map.get("photo_categories");
      if (Array.isArray(v)) setVideo(v as string[]);
      if (Array.isArray(p)) setPhoto(p as string[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return { video, photo, all: [...video, ...photo], loading };
}
