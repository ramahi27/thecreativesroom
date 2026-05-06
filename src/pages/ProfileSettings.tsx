import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useProfile";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CollectionProfileHeader } from "@/components/CollectionProfileHeader";

const ProfileSettings = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { profile, loading, refresh } = useMyProfile();

  useEffect(() => {
    document.title = "My Profile — The Creatives Room";
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen grain flex flex-col">
      <SiteHeader />
      <CollectionProfileHeader profile={profile} loading={loading} onSaved={refresh} />
      <div className="flex-1" />
      <SiteFooter />
    </div>
  );
};

export default ProfileSettings;
