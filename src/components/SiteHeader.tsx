import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User as UserIcon } from "lucide-react";

export function SiteHeader() {
  const { user, isAdmin } = useAuth();
  const { profile, loading: profileLoading } = useMyProfile();
  const navigate = useNavigate();
  const location = useLocation();

  // First-time OAuth users land without a profile row — send them to /welcome.
  useEffect(() => {
    if (!user || profileLoading) return;
    if (profile === null && location.pathname !== "/welcome" && location.pathname !== "/auth") {
      navigate("/welcome");
    }
  }, [user, profile, profileLoading, navigate, location.pathname]);

  return (
    <header className="sticky top-0 z-50 border-b hairline bg-background/70 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-baseline gap-2 group">
          <span className="font-display text-2xl font-black tracking-tighter">The Creatives Room</span>
          <span className="font-mono text-[10px] uppercase text-muted-foreground tracking-[0.2em]">
            <br />
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          {user && (
            <Button asChild variant="ghost" size="sm" className="font-mono text-xs uppercase tracking-widest">
              <Link to="/mycollection">My Collection</Link>
            </Button>
          )}
          {user && (
            <Button asChild variant="ghost" size="sm" className="font-mono text-xs uppercase tracking-widest">
              <Link to="/add">+ New</Link>
            </Button>
          )}
          {isAdmin && (
            <Button asChild variant="ghost" size="sm" className="font-mono text-xs uppercase tracking-widest">
              <Link to="/drafts">Drafts</Link>
            </Button>
          )}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="font-mono text-xs uppercase tracking-widest gap-1.5">
                  <UserIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Account
                </Button>
              </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="font-mono text-xs uppercase tracking-widest">
                {profile?.username && (
                  <DropdownMenuItem onClick={() => navigate(`/@${profile.username}`)}>
                    My profile
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => navigate("/mycollection")}>
                  My collection
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate("/settings")}>
                    Admin settings
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate("/logs")}>
                    Logs
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate("/users")}>
                    Users
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await supabase.auth.signOut();
                    navigate("/");
                  }}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild variant="ghost" size="sm" className="font-mono text-xs uppercase tracking-widest">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
