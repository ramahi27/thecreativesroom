import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Profile } from "@/hooks/useProfile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Share2, LogOut, KeyRound, Settings } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { profileUrl } from "@/lib/username";

interface Props {
  profile: Profile | null;
  loading: boolean;
  onSaved: () => void | Promise<void>;
}

export function CollectionProfileHeader({ profile, loading, onSaved }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  async function handleShare() {
    if (!profile?.username) return;
    const url = profileUrl(profile.username);
    try { await navigator.clipboard.writeText(url); toast.success("Profile link copied"); } catch { toast.error("Could not copy link"); }
  }

  async function handleSendReset() {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent.");
  }

  const initials = (profile?.username || "?").slice(0, 2).toUpperCase();

  return (
    <section className="border-b hairline">
      <div className="container py-10 flex flex-col items-center text-center gap-4">

        {/* Avatar */}
        <div className="relative">
          <div className="h-24 w-24 rounded-full overflow-hidden bg-secondary border-2 border-border">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile?.username} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-primary/5">
                <span className="font-display text-3xl font-black text-primary/50">{initials}</span>
              </div>
            )}
          </div>
        </div>

        {/* Name + bio */}
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight">
            @{profile?.username || (loading ? "…" : "you")}
          </h1>
          {profile?.bio && (
            <p className="mt-2 max-w-md mx-auto font-body text-sm text-muted-foreground leading-relaxed">
              {profile.bio}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <button
            type="button"
            onClick={() => navigate("/account/edit")}
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest px-4 py-2 border hairline hover:border-foreground/40 transition-colors rounded-full"
          >
            <Pencil className="h-3 w-3" strokeWidth={1.8} />
            Edit profile
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={!profile?.username}
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest px-4 py-2 border hairline hover:border-foreground/40 transition-colors rounded-full disabled:opacity-40"
          >
            <Share2 className="h-3 w-3" strokeWidth={1.8} />
            Share
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center h-9 w-9 border hairline rounded-full hover:border-foreground/40 transition-colors"
                aria-label="More"
              >
                <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="font-mono text-xs uppercase tracking-widest">
              <DropdownMenuItem onClick={() => navigate("/account/edit")}>
                <Settings className="h-3 w-3 mr-2" strokeWidth={1.8} /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSendReset}>
                <KeyRound className="h-3 w-3 mr-2" strokeWidth={1.8} /> Reset password
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => { await supabase.auth.signOut(); navigate("/"); }}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="h-3 w-3 mr-2" strokeWidth={1.8} /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Submissions toggle */}
        {profile && (
          <div className="flex items-center gap-2.5 mt-1">
            <Switch
              id="subs-public"
              checked={profile.submissions_public !== false}
              onCheckedChange={async (v) => {
                if (!user) return;
                const { error } = await supabase.rpc("update_my_profile", {
                  p_submissions_public: v,
                });
                if (error) toast.error(error.message);
                else {
                  toast.success(v ? "Submissions are public" : "Submissions are private");
                  await onSaved();
                }
              }}
            />
            <label htmlFor="subs-public" className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground cursor-pointer">
              Public submissions
            </label>
          </div>
        )}
      </div>
    </section>
  );
}
