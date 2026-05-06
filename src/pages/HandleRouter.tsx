import { useParams, Routes, Route } from "react-router-dom";
import Profile from "./Profile";
import PublicFolder from "./PublicFolder";
import NotFound from "./NotFound";

/**
 * Catches `/@<username>/...` URLs.
 * React Router v6 does not reliably match partial dynamic segments
 * (like `/@:username`), so we capture the whole first segment here
 * and dispatch to the right page.
 */
export default function HandleRouter() {
  const { handle } = useParams();
  if (!handle || !handle.startsWith("@")) return <NotFound />;
  const username = handle.slice(1);
  if (!username) return <NotFound />;
  return (
    <Routes>
      <Route index element={<Profile usernameOverride={username} />} />
      <Route path="c/:folderId" element={<PublicFolder usernameOverride={username} />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
