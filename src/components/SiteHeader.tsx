import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const { user, isAdmin } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b hairline bg-background/70 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-baseline gap-2 group">
          <span className="font-display text-2xl font-black tracking-tighter uppercase">The Ref Room</span>
          <span className="font-mono text-[10px] uppercase text-muted-foreground tracking-[0.2em]">
            <br />
          </span>
        </Link>

        <nav className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Button asChild variant="ghost" size="sm" className="font-mono text-xs uppercase tracking-widest">
                <Link to="/drafts">Drafts</Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="font-mono text-xs uppercase tracking-widest">
                <Link to="/add">+ New</Link>
              </Button>
            </>
          )}
          {user ? (
            <Button
              variant="ghost"
              size="sm"
              className="font-mono text-xs uppercase tracking-widest"
              onClick={() => supabase.auth.signOut()}
            >
              Sign out
            </Button>
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
