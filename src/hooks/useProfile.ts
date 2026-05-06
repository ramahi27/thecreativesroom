import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Profile = {
  user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at?: string;
  public_folders_count?: number;
  submitted_count?: number;
};

/** Public lookup by username (anyone can call, uses RPC). */
export function useProfileByUsername(username: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    supabase
      .rpc("get_profile_by_username", { _username: username.toLowerCase() })
      .then(({ data }) => {
        if (cancelled) return;
        if (!data) {
          setNotFound(true);
          setProfile(null);
        } else {
          setProfile(data as unknown as Profile);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  return { profile, loading, notFound };
}

/** Current logged-in user's own profile row (or null if not yet created). */
export function useMyProfile() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("user_id,username,display_name,bio,avatar_url")
      .eq("user_id", user.id)
      .maybeSingle();
    setProfile((data as unknown as Profile) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading]);

  return { profile, loading: authLoading || loading, refresh };
}
