import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import AddReference from "./pages/AddReference.tsx";
import Drafts from "./pages/Drafts.tsx";
import Doubletakes from "./pages/Doubletakes.tsx";
import Uncategorized from "./pages/Uncategorized.tsx";
import Settings from "./pages/Settings.tsx";
import Logs from "./pages/Logs.tsx";
import Users from "./pages/Users.tsx";
import Privacy from "./pages/Privacy.tsx";
import Terms from "./pages/Terms.tsx";
import UserProfile from "./pages/UserProfile.tsx";
import UserFolder from "./pages/UserFolder.tsx";
import Welcome from "./pages/Welcome.tsx";
import ProfileSettings from "./pages/ProfileSettings.tsx";
import { CookieConsent } from "@/components/CookieConsent";
import { LegacyHandleRedirect, MyCollectionRedirect } from "@/components/redirects";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/add" element={<AddReference />} />
          <Route path="/edit/:id" element={<AddReference />} />
          <Route path="/ref/:id" element={<Index />} />
          <Route path="/drafts" element={<Drafts />} />
          <Route path="/drafts/doubletakes" element={<Doubletakes />} />
          <Route path="/drafts/uncategorized" element={<Uncategorized />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/users" element={<Users />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/account/edit" element={<ProfileSettings />} />

          {/* Unified profile + folder routes */}
          <Route path="/u/:username" element={<UserProfile />} />
          <Route path="/u/:username/:folderSlug" element={<UserFolder />} />

          {/* Redirects: legacy paths */}
          <Route path="/collection" element={<MyCollectionRedirect />} />
          <Route path="/mycollection" element={<MyCollectionRedirect />} />
          <Route path="/bookmarks" element={<MyCollectionRedirect />} />
          <Route path="/account" element={<MyCollectionRedirect />} />
          <Route path="/profile" element={<MyCollectionRedirect />} />
          <Route path="/:handle" element={<LegacyHandleRedirect />} />
          <Route path="/:handle/c/:folderId" element={<LegacyHandleRedirect />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
        <CookieConsent />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
