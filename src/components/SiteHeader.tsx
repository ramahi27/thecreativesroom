import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
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
import { Settings, LayoutDashboard, ScrollText, Users, LogOut, Sun, Moon, Zap, Menu, X, Mail } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";

export function SiteHeader() {
  const { user, isAdmin } = useAuth();
  const { isPro } = useSubscription();
  const { profile, loading: profileLoading } = useMyProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

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
        <Link to="/" className="flex items-center group">
          <span className="font-display text-2xl font-black tracking-tighter">The Creatives Room</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" strokeWidth={1.5} /> : <Moon className="h-3.5 w-3.5" strokeWidth={1.5} />}
            {theme === "dark" ? "Day" : "Night"}
          </button>
          {user && !isPro && !isAdmin && (
            <Link
              to="/pricing"
              className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full border hairline text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <Zap className="h-3 w-3" strokeWidth={1.8} />
              Upgrade
            </Link>
          )}
          <Button asChild variant="ghost" size="sm" className="font-mono text-xs uppercase tracking-widest">
            <Link to="/best-of">Best Of The Best</Link>
          </Button>
          {user && profile?.username && (
            <Button asChild variant="ghost" size="sm" className="font-mono text-xs uppercase tracking-widest">
              <Link to={`/u/${profile.username}`}>My Collection</Link>
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
                <button
                  type="button"
                  className="h-8 w-8 rounded-full overflow-hidden ring-2 ring-transparent hover:ring-border transition-all focus-visible:outline-none focus-visible:ring-border"
                  aria-label="Account menu"
                >
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt={profile.username} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-primary/10 text-primary font-display font-black text-xs">
                      {(profile?.username || user.email || "?").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1.5">
                <div className="flex items-center gap-3 px-2 py-2 mb-1">
                  <div className="h-9 w-9 rounded-full overflow-hidden shrink-0 bg-primary/10">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center font-display font-black text-sm text-primary">
                        {(profile?.username || user.email || "?").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-body text-sm font-semibold truncate">@{profile?.username || "…"}</p>
                    <p className="font-mono text-[10px] text-muted-foreground truncate">{user.email}</p>
                  </div>
                </div>
                <DropdownMenuSeparator className="mb-1" />
                {!isPro && !isAdmin && (
                  <>
                    <DropdownMenuItem onClick={() => navigate("/pricing")} className="rounded-lg gap-2.5 text-primary focus:text-primary">
                      <Zap className="h-3.5 w-3.5" strokeWidth={1.8} />
                      <span className="font-body text-sm font-semibold">Upgrade to Pro</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="mb-1" />
                  </>
                )}
                <DropdownMenuItem onClick={() => navigate("/account/edit")} className="rounded-lg gap-2.5">
                  <Settings className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />
                  <span className="font-body text-sm">Settings</span>
                </DropdownMenuItem>
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuItem onClick={() => navigate("/settings")} className="rounded-lg gap-2.5">
                      <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />
                      <span className="font-body text-sm">Admin settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/logs")} className="rounded-lg gap-2.5">
                      <ScrollText className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />
                      <span className="font-body text-sm">Logs</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/users")} className="rounded-lg gap-2.5">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />
                      <span className="font-body text-sm">Users</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/newsletter")} className="rounded-lg gap-2.5">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />
                      <span className="font-body text-sm">Newsletter</span>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator className="my-1" />
                <DropdownMenuItem
                  onClick={async () => { await supabase.auth.signOut(); navigate("/"); }}
                  className="rounded-lg gap-2.5 text-destructive focus:text-destructive"
                >
                  <LogOut className="h-3.5 w-3.5" strokeWidth={1.8} />
                  <span className="font-body text-sm">Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild variant="ghost" size="sm" className="font-mono text-xs uppercase tracking-widest">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </nav>

        {/* Mobile right side: avatar + burger */}
        <div className="flex md:hidden items-center gap-2">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-8 w-8 rounded-full overflow-hidden ring-2 ring-transparent hover:ring-border transition-all focus-visible:outline-none focus-visible:ring-border"
                  aria-label="Account menu"
                >
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt={profile.username} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-primary/10 text-primary font-display font-black text-xs">
                      {(profile?.username || user.email || "?").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1.5">
                <div className="flex items-center gap-3 px-2 py-2 mb-1">
                  <div className="h-9 w-9 rounded-full overflow-hidden shrink-0 bg-primary/10">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center font-display font-black text-sm text-primary">
                        {(profile?.username || user.email || "?").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-body text-sm font-semibold truncate">@{profile?.username || "…"}</p>
                    <p className="font-mono text-[10px] text-muted-foreground truncate">{user.email}</p>
                  </div>
                </div>
                <DropdownMenuSeparator className="mb-1" />
                {!isPro && !isAdmin && (
                  <>
                    <DropdownMenuItem onClick={() => navigate("/pricing")} className="rounded-lg gap-2.5 text-primary focus:text-primary">
                      <Zap className="h-3.5 w-3.5" strokeWidth={1.8} />
                      <span className="font-body text-sm font-semibold">Upgrade to Pro</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="mb-1" />
                  </>
                )}
                <DropdownMenuItem onClick={() => navigate("/account/edit")} className="rounded-lg gap-2.5">
                  <Settings className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />
                  <span className="font-body text-sm">Settings</span>
                </DropdownMenuItem>
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuItem onClick={() => navigate("/settings")} className="rounded-lg gap-2.5">
                      <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />
                      <span className="font-body text-sm">Admin settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/logs")} className="rounded-lg gap-2.5">
                      <ScrollText className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />
                      <span className="font-body text-sm">Logs</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/users")} className="rounded-lg gap-2.5">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />
                      <span className="font-body text-sm">Users</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/newsletter")} className="rounded-lg gap-2.5">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />
                      <span className="font-body text-sm">Newsletter</span>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator className="my-1" />
                <DropdownMenuItem
                  onClick={async () => { await supabase.auth.signOut(); navigate("/"); }}
                  className="rounded-lg gap-2.5 text-destructive focus:text-destructive"
                >
                  <LogOut className="h-3.5 w-3.5" strokeWidth={1.8} />
                  <span className="font-body text-sm">Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="flex items-center justify-center h-8 w-8 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" strokeWidth={1.5} /> : <Menu className="h-5 w-5" strokeWidth={1.5} />}
          </button>
        </div>
      </div>

      {/* Mobile slide-down menu */}
      {mobileOpen && (
        <div className="md:hidden border-t hairline bg-background/95 backdrop-blur-xl">
          <nav className="container py-4 flex flex-col gap-1">
            <button
              onClick={() => { setTheme(theme === "dark" ? "light" : "dark"); setMobileOpen(false); }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors text-left"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" strokeWidth={1.5} /> : <Moon className="h-4 w-4" strokeWidth={1.5} />}
              {theme === "dark" ? "Switch to Day" : "Switch to Night"}
            </button>

            <Link
              to="/best-of"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              Best Of The Best
            </Link>
            {user && profile?.username && (
              <Link
                to={`/u/${profile.username}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                My Collection
              </Link>
            )}
            {user && (
              <Link
                to="/add"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                + New
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/drafts"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Drafts
              </Link>
            )}
            {user && !isPro && !isAdmin && (
              <Link
                to="/pricing"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl font-mono text-[11px] uppercase tracking-widest text-primary hover:bg-primary/10 transition-colors"
              >
                <Zap className="h-4 w-4" strokeWidth={1.8} />
                Upgrade to Pro
              </Link>
            )}
            {!user && (
              <Link
                to="/auth"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
