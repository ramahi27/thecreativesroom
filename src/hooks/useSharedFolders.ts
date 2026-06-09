import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Folder } from "@/hooks/useFolders";

export type SharedFolder = Folder & {
  owner_username: string;
  owner_user_id: string;
  preview_thumbs: string[];
  ref_count: number;
};

export function useSharedFolders() {
  const { user } = useAuth();
  const [sharedFolders, setSharedFolders] = useState<SharedFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: memberships } = await supabase
      .from("folder_members" as any)
      .select("folder_id")
      .eq("user_id", user.id);

    if (!memberships || (memberships as any[]).length === 0) {
      setSharedFolders([]);
      setLoading(false);
      setLoaded(true);
      return;
    }

    const folderIds = (memberships as any[]).map((m: any) => m.folder_id);

    const [foldersRes, itemsRes] = await Promise.all([
      supabase.from("folders").select("id, name, color, position, is_public, user_id").in("id", folderIds),
      supabase.from("folder_items").select("folder_id, reference_id").in("folder_id", folderIds),
    ]);

    const foldersData = (foldersRes.data || []) as any[];
    const itemsData = (itemsRes.data || []) as { folder_id: string; reference_id: string }[];

    const ownerIds = [...new Set(foldersData.map((f) => f.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, username")
      .in("user_id", ownerIds);

    const profileMap: Record<string, string> = {};
    for (const p of profiles || []) profileMap[p.user_id] = p.username;

    const refIds = [...new Set(itemsData.map((i) => i.reference_id))].slice(0, 120);
    let thumbMap: Record<string, string> = {};
    if (refIds.length > 0) {
      const { data: refs } = await supabase
        .from("references")
        .select("id, thumbnail_url, media_url")
        .in("id", refIds);
      for (const r of (refs || []) as any[]) {
        thumbMap[r.id] = r.thumbnail_url || r.media_url || "";
      }
    }

    const built: SharedFolder[] = foldersData.map((f) => {
      const folderRefIds = itemsData.filter((i) => i.folder_id === f.id).map((i) => i.reference_id);
      return {
        id: f.id,
        name: f.name,
        color: f.color,
        position: f.position,
        is_public: f.is_public,
        owner_username: profileMap[f.user_id] || "unknown",
        owner_user_id: f.user_id,
        preview_thumbs: folderRefIds.slice(0, 4).map((rid) => thumbMap[rid]).filter(Boolean) as string[],
        ref_count: folderRefIds.length,
      };
    });

    setSharedFolders(built);
    setLoading(false);
    setLoaded(true);
  }, [user?.id]);

  return { sharedFolders, loading, loaded, load };
}
