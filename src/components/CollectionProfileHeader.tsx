import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Profile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Share2, LogOut, KeyRound } from "lucide-react";
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
    try {
      if (navigator.share) {
        await navigator.share({ url, title: `@${profile.username}` });
        return;
      }
    } catch {}
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Profile link copied");
    } catch {}
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
    <section className="relative overflow-hidden border-b hairline">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--gradient-spotlight)" }}
      />

      {/* ── MOBILE layout (< md) ── clean settings-list style */}
      <div className="md:hidden container py-6 relative space-y-4">
        {/* Row 1: avatar + name + actions */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 rounded-full bg-secondary border hairline overflow-hidden flex items-center justify-center">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile?.username} className="h-full w-full object-cover" />
            ) : (
              <span className="font-display text-sm font-black">{initials}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[9px] uppercase tracking-widest text-primary">My Collection</p>
            <p className="font-display text-xl font-black tracking-tight truncate">
              @{profile?.username || (loading ? "…" : "you")}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate("/account/edit")}
              className="h-8 w-8 p-0"
              aria-label="Edit profile"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="More">
                  <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="font-mono text-xs uppercase tracking-widest">
                <DropdownMenuItem onClick={handleShare} disabled={!profile?.username}>
                  <Share2 className="h-3 w-3 mr-2" strokeWidth={1.8} /> Share profile
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
        </div>

        {/* Bio */}
        {profile?.bio && (
          <p className="font-body text-sm text-foreground/70 leading-relaxed">
            {profile.bio}
          </p>
        )}

        {/* Submissions toggle row */}
        {profile && (
          <div className="flex items-center justify-between gap-3 border hairline rounded-xl px-4 py-3">
            <label htmlFor="subs-public-mobile" className="font-mono text-[10px] uppercase tracking-widest cursor-pointer">
              Public submissions
            </label>
            <Switch
              id="subs-public-mobile"
              checked={profile.submissions_public !== false}
              onCheckedChange={async (v) => {
                if (!user) return;
                const { error } = await supabase
                  .from("profiles")
                  .update({ submissions_public: v })
                  .eq("user_id", user.id);
                if (error) toast.error(error.message);
                else {
                  toast.success(v ? "Submissions are public" : "Submissions are private");
                  await onSaved();
                }
              }}
            />
          </div>
        )}
      </div>

      {/* ── DESKTOP layout (≥ md) ── cinematic */}
      <div className="hidden md:block container py-20 relative">
        <div className="flex md:flex-row md:items-end gap-10">
          <div className="h-28 w-28 shrink-0 bg-secondary border hairline overflow-hidden flex items-center justify-center shadow-[var(--shadow-cinema)]">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={profile?.username} className="h-full w-full object-cover" />
            ) : (
              <span className="font-display text-3xl font-black">{initials}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-3">
              ⏵ My Collection
            </p>
            <h1 className="font-display text-7xl font-black tracking-tighter leading-[0.9]">
              @{profile?.username || (loading ? "…" : "you")}
            </h1>
            {profile?.bio && (
              <p className="mt-3 max-w-2xl font-body text-base text-foreground/80 leading-relaxed">
                {profile.bio}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate("/account/edit")}
                className="font-mono text-[10px] uppercase tracking-widest h-8 gap-1.5"
              >
                <Pencil className="h-3 w-3" strokeWidth={1.8} /> Edit profile
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleShare}
                disabled={!profile?.username}
                className="font-mono text-[10px] uppercase tracking-widest h-8 gap-1.5"
              >
                <Share2 className="h-3 w-3" strokeWidth={1.8} /> Share profile
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 px-2" aria-label="More">
                    <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="font-mono text-xs uppercase tracking-widest">
                  <DropdownMenuItem onClick={() => navigate("/account/edit")}>
                    Edit profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSendReset}>
                    Send reset email
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => { await supabase.auth.signOut(); navigate("/"); }}
                  >
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {profile && (
              <div className="mt-4 flex items-center gap-3 border hairline px-3 py-2 w-fit">
                <Switch
                  id="subs-public"
                  checked={profile.submissions_public !== false}
                  onCheckedChange={async (v) => {
                    if (!user) return;
                    const { error } = await supabase
                      .from("profiles")
                      .update({ submissions_public: v })
                      .eq("user_id", user.id);
                    if (error) toast.error(error.message);
                    else {
                      toast.success(v ? "Submissions are public" : "Submissions are private");
                      await onSaved();
                    }
                  }}
                />
                <label htmlFor="subs-public" className="font-mono text-[10px] uppercase tracking-widest cursor-pointer">
                  Show submissions on public profile
                </label>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
