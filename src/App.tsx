import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CookieConsent } from "@/components/CookieConsent";
import { LegacyHandleRedirect, MyCollectionRedirect } from "@/components/redirects";

// Critical path — loaded immediately for fast first paint
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import NotFound from "./pages/NotFound.tsx";
import UserProfile from "./pages/UserProfile.tsx";
import UserFolder from "./pages/UserFolder.tsx";
import Privacy from "./pages/Privacy.tsx";
import Terms from "./pages/Terms.tsx";

// Lazy-loaded — split into separate chunks to shrink the initial JS bundle
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const AddReference = lazy(() => import("./pages/AddReference.tsx"));
const Drafts = lazy(() => import("./pages/Drafts.tsx"));
const Doubletakes = lazy(() => import("./pages/Doubletakes.tsx"));
const Uncategorized = lazy(() => import("./pages/Uncategorized.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const Logs = lazy(() => import("./pages/Logs.tsx"));
const Users = lazy(() => import("./pages/Users.tsx"));
const Welcome = lazy(() => import("./pages/Welcome.tsx"));
const ProfileSettings = lazy(() => import("./pages/ProfileSettings.tsx"));
const Pricing = lazy(() => import("./pages/Pricing.tsx"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={null}>
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
            <Route path="/pricing" element={<Pricing />} />

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
        </Suspense>
        <CookieConsent />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
