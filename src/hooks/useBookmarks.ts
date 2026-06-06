import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Singleton bookmark store — one fetch per signed-in user, shared by every
// BookmarkButton on the page. Without this, a grid of N cards triggered N
// identical queries on every navigation.

let cachedIds: Set<string> = new Set();
let cachedUserId: string | null = null;
let loaded = false;
let inflight: Promise<void> | null = null;
let inflightUserId: string | null = null;
const listeners = new Set<(ids: Set<string>) => void>();

function emit() {
  listeners.forEach((l) => l(cachedIds));
}

async function loadFor(userId: string) {
  // Reuse an in-flight load only if it's for the same user. If the user
  // switched accounts mid-load, start a fresh fetch for the new user.
  if (inflight && inflightUserId === userId) return inflight;
  inflightUserId = userId;
  inflight = (async () => {
    const { data } = await supabase
      .from("bookmarks")
      .select("reference_id")
      .eq("user_id", userId);
    // Drop the result if the active user changed while we were fetching.
    if (inflightUserId !== userId) return;
    cachedIds = new Set((data || []).map((r: any) => r.reference_id as string));
    cachedUserId = userId;
    loaded = true;
    emit();
  })();
  try {
    await inflight;
  } finally {
    if (inflightUserId === userId) {
      inflight = null;
      inflightUserId = null;
    }
  }
}

function reset() {
  cachedIds = new Set();
  cachedUserId = null;
  loaded = false;
  emit();
}

export function useBookmarks() {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<string>>(cachedIds);
  const [loading, setLoading] = useState(!loaded);

  useEffect(() => {
    listeners.add(setIds);
    return () => {
      listeners.delete(setIds);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      if (cachedUserId !== null) reset();
      setLoading(false);
      return;
    }
    if (cachedUserId === user.id && loaded) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadFor(user.id).then(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    const handler = () => {
      if (!user) return;
      loaded = false;
      loadFor(user.id);
    };
    window.addEventListener("bookmarks:refresh", handler);
    return () => window.removeEventListener("bookmarks:refresh", handler);
  }, [user]);

  const refresh = useCallback(async () => {
    if (!user) return;
    loaded = false;
    await loadFor(user.id);
  }, [user]);

  const toggle = useCallback(
    async (referenceId: string) => {
      if (!user) return { error: "Not signed in" as const };
      const has = cachedIds.has(referenceId);
      // optimistic — remember the previous state so we can snap back instantly on failure
      const prev = cachedIds;
      const next = new Set(cachedIds);
      has ? next.delete(referenceId) : next.add(referenceId);
      cachedIds = next;
      emit();
      if (has) {
        const { error } = await supabase
          .from("bookmarks")
          .delete()
          .eq("user_id", user.id)
          .eq("reference_id", referenceId);
        if (error) {
          cachedIds = prev;
          emit();
          await refresh();
        } else {
          // Cascade: also remove from all of the user's folders
          await supabase
            .from("folder_items")
            .delete()
            .eq("user_id", user.id)
            .eq("reference_id", referenceId);
          window.dispatchEvent(
            new CustomEvent("folders:refresh", { detail: { referenceId } }),
          );
        }
        return { error: error?.message };
      } else {
        const { error } = await supabase
          .from("bookmarks")
          .insert({ user_id: user.id, reference_id: referenceId });
        if (error) {
          cachedIds = prev;
          emit();
          await refresh();
        }
        return { error: error?.message };
      }
    },
    [user, refresh],
  );

  return { ids, loading, toggle, refresh, isBookmarked: (id: string) => ids.has(id) };
}
