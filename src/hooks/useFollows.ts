import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Folder } from "@/hooks/useFolders";
import type { Reference } from "@/lib/references";

export type FollowedFolder = Folder & {
  user_id: string;
  owner_username: string;
  owner_avatar_url: string | null;
  refs: Reference[];
};

/** Tracks which folder IDs the current user follows + helpers to follow/unfollow. */
export function useMyFollows() {
  const { user } = useAuth();
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setFollowedIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("folder_follows")
      .select("folder_id")
      .eq("user_id", user.id);
    setFollowedIds(new Set((data || []).map((r: any) => r.folder_id)));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const follow = useCallback(
    async (folderId: string) => {
      if (!user) return;
      setFollowedIds((prev) => new Set(prev).add(folderId));
      const { error } = await supabase
        .from("folder_follows")
        .insert({ folder_id: folderId, user_id: user.id });
      if (error) refresh();
      else window.dispatchEvent(new CustomEvent("follows:refresh"));
    },
    [user, refresh],
  );

  const unfollow = useCallback(
    async (folderId: string) => {
      if (!user) return;
      setFollowedIds((prev) => {
        const next = new Set(prev);
        next.delete(folderId);
        return next;
      });
      const { error } = await supabase
        .from("folder_follows")
        .delete()
        .eq("user_id", user.id)
        .eq("folder_id", folderId);
      if (error) refresh();
      else window.dispatchEvent(new CustomEvent("follows:refresh"));
    },
    [user, refresh],
  );

  const isFollowing = (id: string) => followedIds.has(id);

  return { followedIds, isFollowing, follow, unfollow, loading, refresh };
}

/** Loads full data (folder + owner + first refs) for everything the user follows. */
export function useFollowedFolders() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<FollowedFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setFolders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: follows } = await supabase
      .from("folder_follows")
      .select("folder_id,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    const ids = (follows || []).map((f: any) => f.folder_id);
    if (ids.length === 0) {
      setFolders([]);
      setLoading(false);
      return;
    }
    const { data: f } = await supabase
      .from("folders")
      .select("id,name,color,position,is_public,user_id")
      .in("id", ids)
      .eq("is_public", true);
    const folderRows = (f as any[]) || [];
    const ownerIds = Array.from(new Set(folderRows.map((r) => r.user_id)));
    const [ownersRes, itemsRes] = await Promise.all([
      ownerIds.length
        ? supabase.from("profiles").select("user_id,username,avatar_url").in("user_id", ownerIds)
        : Promise.resolve({ data: [] as any[] }),
      supabase.from("folder_items").select("folder_id,reference_id").in("folder_id", folderRows.map((r) => r.id)),
    ]);
    const ownerMap = new Map((ownersRes.data || []).map((o: any) => [o.user_id, o]));
    const items = itemsRes;
    const refIds = Array.from(new Set((items.data || []).map((it: any) => it.reference_id)));
    const refsById = new Map<string, Reference>();
    if (refIds.length) {
      const { data: rs } = await supabase
        .from("references")
        .select("id,title,type,media_url,source_url,thumbnail_url,brand,agency,year,tags,categories,published,media_items,created_at")
        .in("id", refIds)
        .eq("published", true);
      for (const r of (rs as any[]) || []) refsById.set(r.id, r as Reference);
    }
    const itemsByFolder = new Map<string, string[]>();
    for (const it of (items.data as any[]) || []) {
      const arr = itemsByFolder.get(it.folder_id) || [];
      arr.push(it.reference_id);
      itemsByFolder.set(it.folder_id, arr);
    }

    // preserve follow order
    const ordered: FollowedFolder[] = ids
      .map((id) => folderRows.find((r) => r.id === id))
      .filter(Boolean)
      .map((row: any) => {
        const owner = ownerMap.get(row.user_id);
        return {
          ...(row as any),
          owner_username: owner?.username || "",
          owner_avatar_url: owner?.avatar_url || null,
          refs: (itemsByFolder.get(row.id) || [])
            .map((rid) => refsById.get(rid))
            .filter(Boolean) as Reference[],
        };
      });

    setFolders(ordered);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("follows:refresh", handler);
    return () => window.removeEventListener("follows:refresh", handler);
  }, [load]);

  return { folders, loading, refresh: load };
}
