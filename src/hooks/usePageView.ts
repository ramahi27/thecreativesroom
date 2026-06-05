import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const VISITOR_KEY = "tcr_visitor_id";
const COUNTRY_KEY = "tcr_country";

function getVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return "anon-" + Math.random().toString(36).slice(2);
  }
}

let countryPromise: Promise<string | null> | null = null;
function getCountry(): Promise<string | null> {
  try {
    const cached = localStorage.getItem(COUNTRY_KEY);
    if (cached) return Promise.resolve(cached);
  } catch {}
  if (countryPromise) return countryPromise;
  countryPromise = fetch("https://get.geojs.io/v1/ip/country.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((j: any) => {
      const c = j?.name || j?.country || null;
      if (c) {
        try {
          localStorage.setItem(COUNTRY_KEY, c);
        } catch {}
      }
      return c;
    })
    .catch(() => null);
  return countryPromise;
}

/**
 * Records a page view and updates duration on unmount/unload.
 * Pass a referenceId when viewing a specific project (e.g. modal open).
 */
export function usePageView(path: string, referenceId?: string | null) {
  useEffect(() => {
    if (!path) return;
    let viewId: string | null = null;
    let cancelled = false;
    const startedAt = Date.now();
    const visitorId = getVisitorId();

    (async () => {
      const [{ data: { session } }, country] = await Promise.all([
        supabase.auth.getSession(),
        getCountry(),
      ]);
      const { data, error } = await supabase
        .from("page_views")
        .insert({
          visitor_id: visitorId,
          user_id: session?.user?.id ?? null,
          path,
          reference_id: referenceId ?? null,
          country,
        } as any)
        .select("id")
        .single();
      if (!cancelled && !error && data) viewId = data.id;
    })();

    const finalize = () => {
      if (!viewId) return;
      const seconds = Math.min(3600, Math.round((Date.now() - startedAt) / 1000));
      if (seconds <= 0) return;
      supabase.from("page_views").update({ duration_seconds: seconds }).eq("id", viewId);
    };

    window.addEventListener("beforeunload", finalize);
    return () => {
      cancelled = true;
      finalize();
      window.removeEventListener("beforeunload", finalize);
    };
  }, [path, referenceId]);
}
