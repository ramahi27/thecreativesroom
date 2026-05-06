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
import Bookmarks from "./pages/Bookmarks.tsx";
import Settings from "./pages/Settings.tsx";
import Logs from "./pages/Logs.tsx";
import Users from "./pages/Users.tsx";

import Privacy from "./pages/Privacy.tsx";
import Terms from "./pages/Terms.tsx";
import Profile from "./pages/Profile.tsx";
import PublicFolder from "./pages/PublicFolder.tsx";
import Welcome from "./pages/Welcome.tsx";
import { CookieConsent } from "@/components/CookieConsent";

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
          <Route path="/bookmarks" element={<Bookmarks />} />
          <Route path="/mycollection" element={<Bookmarks />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/users" element={<Users />} />
          <Route path="/account" element={<Bookmarks />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/:handle" element={<Profile />} />
          <Route path="/:handle/c/:folderId" element={<PublicFolder />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <CookieConsent />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
