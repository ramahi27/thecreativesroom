import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const VISITOR_KEY = "tcr_visitor_id";

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

/**
 * Records a page view and updates duration on unmount/unload.
 * Pass a referenceId when viewing a specific project (e.g. modal open).
 */
export function usePageView(path: string, referenceId?: string | null) {
  useEffect(() => {
    if (!path) return;
    let viewId: string | null = null;
    let cancelled = false;
    let finalized = false;
    let pendingSeconds = 0;
    const startedAt = Date.now();
    const visitorId = getVisitorId();

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase
        .from("page_views")
        .insert({
          visitor_id: visitorId,
          user_id: session?.user?.id ?? null,
          path,
          reference_id: referenceId ?? null,
        })
        .select("id")
        .single();
      if (!cancelled && !error && data) {
        viewId = data.id;
        // finalize() was called before INSERT resolved — send duration now
        if (pendingSeconds > 0) {
          supabase.from("page_views").update({ duration_seconds: pendingSeconds }).eq("id", viewId);
        }
      }
    })();

    const finalize = () => {
      if (finalized) return;
      finalized = true;
      window.removeEventListener("beforeunload", finalize);
      const seconds = Math.min(3600, Math.round((Date.now() - startedAt) / 1000));
      if (seconds <= 0) return;
      if (viewId) {
        supabase.from("page_views").update({ duration_seconds: seconds }).eq("id", viewId);
      } else {
        // INSERT hasn't resolved yet — store duration and send once viewId arrives
        pendingSeconds = seconds;
      }
    };

    window.addEventListener("beforeunload", finalize);
    return () => {
      cancelled = true;
      finalize();
    };
  }, [path, referenceId]);
}
