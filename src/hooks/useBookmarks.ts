import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useBookmarks() {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setIds(new Set());
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("bookmarks").select("reference_id").eq("user_id", user.id);
    setIds(new Set((data || []).map((r: any) => r.reference_id as string)));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = useCallback(
    async (referenceId: string) => {
      if (!user) return { error: "Not signed in" as const };
      const has = ids.has(referenceId);
      // optimistic
      setIds((prev) => {
        const next = new Set(prev);
        has ? next.delete(referenceId) : next.add(referenceId);
        return next;
      });
      if (has) {
        const { error } = await supabase
          .from("bookmarks")
          .delete()
          .eq("user_id", user.id)
          .eq("reference_id", referenceId);
        if (error) await refresh();
        return { error: error?.message };
      } else {
        const { error } = await supabase
          .from("bookmarks")
          .insert({ user_id: user.id, reference_id: referenceId });
        if (error) await refresh();
        return { error: error?.message };
      }
    },
    [user, ids, refresh],
  );

  return { ids, loading, toggle, refresh, isBookmarked: (id: string) => ids.has(id) };
}
