import { Navigate, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useProfile";

/** /@username → /u/username (preserves trailing path including /c/:id legacy) */
export function LegacyHandleRedirect() {
  const { handle } = useParams();
  const location = useLocation();
  if (!handle?.startsWith("@")) return <Navigate to="/" replace />;
  const username = handle.slice(1);
  // strip /c/:id legacy folder route into a query so UserProfile can ignore it
  const tail = location.pathname.replace(/^\/@[^/]+/, "");
  // /@u/c/:id  → /u/u (folder slug unknown by id; just send to profile)
  if (tail.startsWith("/c/")) return <Navigate to={`/u/${username}`} replace />;
  return <Navigate to={`/u/${username}${tail}`} replace />;
}

/** /collection or /mycollection → /u/<my username> */
export function MyCollectionRedirect() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading } = useMyProfile();
  if (authLoading || loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!profile?.username) return <Navigate to="/welcome" replace />;
  return <Navigate to={`/u/${profile.username}`} replace />;
}
