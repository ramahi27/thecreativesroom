import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_VIDEO = ["Commercials", "Promos / Trailers", "Case Studies", "Social Content"];
const DEFAULT_PHOTO = ["Campaign", "Branding", "Copy Driven"];

type CatCache = { video: string[]; photo: string[] };
let _cache: CatCache | null = null;
let _promise: Promise<CatCache> | null = null;

function fetchCategories(): Promise<CatCache> {
  if (_cache) return Promise.resolve(_cache);
  if (_promise) return _promise;
  _promise = (async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["video_categories", "photo_categories"]);
    const map = new Map((data || []).map((r: any) => [r.key, r.value]));
    const v = map.get("video_categories");
    const p = map.get("photo_categories");
    _cache = {
      video: Array.isArray(v) ? (v as string[]) : DEFAULT_VIDEO,
      photo: Array.isArray(p) ? (p as string[]) : DEFAULT_PHOTO,
    };
    _promise = null;
    return _cache;
  })();
  return _promise;
}

export function useCategories() {
  const [video, setVideo] = useState<string[]>(_cache?.video ?? DEFAULT_VIDEO);
  const [photo, setPhoto] = useState<string[]>(_cache?.photo ?? DEFAULT_PHOTO);
  const [loading, setLoading] = useState(_cache === null);

  useEffect(() => {
    if (_cache) { setLoading(false); return; }
    let active = true;
    fetchCategories().then((c) => {
      if (!active) return;
      setVideo(c.video);
      setPhoto(c.photo);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return { video, photo, all: [...video, ...photo], loading };
}
