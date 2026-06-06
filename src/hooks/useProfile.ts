import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Profile = {
  user_id: string;
  username: string;
  bio: string | null;
  avatar_url: string | null;
  created_at?: string;
  public_folders_count?: number;
  submitted_count?: number;
  submissions_public?: boolean;
};

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
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load profile", error);
          setNotFound(true);
          setProfile(null);
        } else if (!data) {
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
      .select("user_id,username,bio,avatar_url,submissions_public")
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
