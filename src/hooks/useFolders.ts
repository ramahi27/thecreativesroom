import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Folder = {
  id: string;
  name: string;
  color: string | null;
  position: number;
  is_public: boolean;
};

export type FolderItem = {
  folder_id: string;
  reference_id: string;
};

// Module-level cache — persists across remounts
let _foldersCache: { uid: string; folders: Folder[]; items: FolderItem[] } | null = null;

export function useFolders() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<Folder[]>(() => _foldersCache?.folders ?? []);
  const [items, setItems] = useState<FolderItem[]>(() => _foldersCache?.items ?? []);
  const [loading, setLoading] = useState(() => _foldersCache === null);

  const refresh = useCallback(async (silent = false) => {
    if (!user) {
      _foldersCache = null;
      setFolders([]);
      setItems([]);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    const { data, error } = await supabase.rpc("get_my_folders", { p_user_id: user.id });
    const result = error ? null : (data as { folders: Folder[]; items: FolderItem[] } | null);
    const newFolders = result?.folders ?? [];
    const newItems = result?.items ?? [];
    _foldersCache = { uid: user.id, folders: newFolders, items: newItems };
    setFolders(newFolders);
    setItems(newItems);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    // Silent if we already have cached data for this user; otherwise show loader
    const hasCached = !!user && _foldersCache?.uid === user.id;
    refresh(!hasCached);
  }, [refresh, user]);

  useEffect(() => {
    const handler = () => refresh(true); // always silent — data is already shown
    window.addEventListener("folders:refresh", handler);
    return () => window.removeEventListener("folders:refresh", handler);
  }, [refresh]);

  const broadcast = () => window.dispatchEvent(new CustomEvent("folders:refresh"));

  const createFolder = useCallback(
    async (name: string, color?: string) => {
      if (!user || !name.trim()) return null;
      const position = folders.length;
      const { data, error } = await supabase
        .from("folders")
        .insert({ user_id: user.id, name: name.trim(), color: color || null, position, is_public: true })
        .select("id,name,color,position,is_public")
        .single();
      if (error) return null;
      setFolders((prev) => [...prev, data as Folder]);
      broadcast();
      return data as Folder;
    },
    [user, folders.length],
  );

  const setVisibility = useCallback(async (id: string, is_public: boolean) => {
    const prev = folders;
    setFolders((p) => p.map((f) => (f.id === id ? { ...f, is_public } : f)));
    const { error } = await supabase.from("folders").update({ is_public }).eq("id", id);
    if (error) setFolders(prev);
    else broadcast();
  }, [folders]);

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      const { error } = await supabase.from("folders").update({ name }).eq("id", id);
      if (!error) {
        setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
        broadcast();
      }
    },
    [],
  );

  const updateColor = useCallback(async (id: string, color: string) => {
    const { error } = await supabase.from("folders").update({ color }).eq("id", id);
    if (!error) {
      setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, color } : f)));
      broadcast();
    }
  }, []);

  const deleteFolder = useCallback(
    async (id: string) => {
      if (!user) return;
      // Find references that live ONLY in this folder, so we can also remove
      // their bookmarks (per product rule: deleting a folder should NOT push
      // its projects back into "Unsorted").
      const inThis = items.filter((it) => it.folder_id === id).map((it) => it.reference_id);
      const inOthers = new Set(
        items.filter((it) => it.folder_id !== id).map((it) => it.reference_id),
      );
      const orphanedRefIds = inThis.filter((rid) => !inOthers.has(rid));

      const { error } = await supabase.from("folders").delete().eq("id", id);
      if (error) return;

      setFolders((prev) => prev.filter((f) => f.id !== id));
      setItems((prev) => prev.filter((it) => it.folder_id !== id));

      if (orphanedRefIds.length > 0) {
        await supabase
          .from("bookmarks")
          .delete()
          .eq("user_id", user.id)
          .in("reference_id", orphanedRefIds);
        window.dispatchEvent(
          new CustomEvent("bookmarks:refresh", { detail: { referenceIds: orphanedRefIds } }),
        );
      }
      broadcast();
    },
    [user, items],
  );

  const addToFolder = useCallback(
    async (folderId: string, referenceIds: string[]) => {
      if (!user || referenceIds.length === 0) return;
      const rows = referenceIds.map((rid) => ({
        folder_id: folderId,
        reference_id: rid,
        user_id: user.id,
      }));
      setItems((prev) => {
        const next = [...prev];
        for (const r of rows) {
          if (!next.some((it) => it.folder_id === r.folder_id && it.reference_id === r.reference_id)) {
            next.push({ folder_id: r.folder_id, reference_id: r.reference_id });
          }
        }
        return next;
      });
      const { error } = await supabase.from("folder_items").upsert(rows, {
        onConflict: "folder_id,reference_id",
        ignoreDuplicates: true,
      });
      if (error) refresh();
      else broadcast();
    },
    [user, refresh],
  );

  const removeFromFolder = useCallback(
    async (folderId: string, referenceId: string) => {
      setItems((prev) =>
        prev.filter((it) => !(it.folder_id === folderId && it.reference_id === referenceId)),
      );
      const { error } = await supabase
        .from("folder_items")
        .delete()
        .eq("folder_id", folderId)
        .eq("reference_id", referenceId);
      if (error) refresh();
      else broadcast();
    },
    [refresh],
  );

  const foldersForReference = useCallback(
    (referenceId: string) =>
      items.filter((it) => it.reference_id === referenceId).map((it) => it.folder_id),
    [items],
  );

  const countForFolder = useCallback(
    (folderId: string) => items.filter((it) => it.folder_id === folderId).length,
    [items],
  );

  return {
    folders,
    items,
    loading,
    refresh,
    createFolder,
    renameFolder,
    updateColor,
    setVisibility,
    deleteFolder,
    addToFolder,
    removeFromFolder,
    foldersForReference,
    countForFolder,
  };
}
