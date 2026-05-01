import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Folder = {
  id: string;
  name: string;
  color: string | null;
  position: number;
};

export type FolderItem = {
  folder_id: string;
  reference_id: string;
};

export function useFolders() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [items, setItems] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setFolders([]);
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: f }, { data: i }] = await Promise.all([
      supabase
        .from("folders")
        .select("id,name,color,position")
        .eq("user_id", user.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("folder_items")
        .select("folder_id,reference_id")
        .eq("user_id", user.id),
    ]);
    setFolders((f as Folder[]) || []);
    setItems((i as FolderItem[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createFolder = useCallback(
    async (name: string, color?: string) => {
      if (!user || !name.trim()) return null;
      const position = folders.length;
      const { data, error } = await supabase
        .from("folders")
        .insert({ user_id: user.id, name: name.trim(), color: color || null, position })
        .select("id,name,color,position")
        .single();
      if (error) return null;
      setFolders((prev) => [...prev, data as Folder]);
      return data as Folder;
    },
    [user, folders.length],
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      const { error } = await supabase.from("folders").update({ name }).eq("id", id);
      if (!error) setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
    },
    [],
  );

  const updateColor = useCallback(async (id: string, color: string) => {
    const { error } = await supabase.from("folders").update({ color }).eq("id", id);
    if (!error) setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, color } : f)));
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    const { error } = await supabase.from("folders").delete().eq("id", id);
    if (!error) {
      setFolders((prev) => prev.filter((f) => f.id !== id));
      setItems((prev) => prev.filter((it) => it.folder_id !== id));
    }
  }, []);

  const addToFolder = useCallback(
    async (folderId: string, referenceIds: string[]) => {
      if (!user || referenceIds.length === 0) return;
      const rows = referenceIds.map((rid) => ({
        folder_id: folderId,
        reference_id: rid,
        user_id: user.id,
      }));
      // optimistic
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
    deleteFolder,
    addToFolder,
    removeFromFolder,
    foldersForReference,
    countForFolder,
  };
}
