import { useEffect, useRef, useState } from "react";
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
import { MoreHorizontal, Pencil, Share2 } from "lucide-react";
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

  return (
    <section className="border-b hairline">
      <div className="container py-10 md:py-14">
        <div className="flex flex-col md:flex-row md:items-end gap-6 md:gap-10">
          <div className="h-20 w-20 md:h-28 md:w-28 shrink-0 bg-secondary border hairline overflow-hidden flex items-center justify-center">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.username}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-display text-2xl md:text-3xl font-black">
                {(profile?.username || "?").slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-3">
              ⏵ My Collection
            </p>
            <h1 className="font-display text-4xl md:text-6xl font-black tracking-tighter leading-[0.95]">
              @{profile?.username || (loading ? "…" : "you")}
            </h1>
            {profile?.bio && (
              <p className="mt-3 max-w-2xl font-body text-sm md:text-base text-foreground/80 leading-relaxed">
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
                  <Button
                    size="sm"
                    variant="ghost"
                    className="font-mono text-[10px] uppercase tracking-widest h-8 px-2"
                    aria-label="More"
                  >
                    <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="font-mono text-xs uppercase tracking-widest"
                >
                  <DropdownMenuItem onClick={() => navigate("/account/edit")}>
                    Edit profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSendReset}>
                    Send reset email
                  </DropdownMenuItem>
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
                <label
                  htmlFor="subs-public"
                  className="font-mono text-[10px] uppercase tracking-widest cursor-pointer"
                >
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
