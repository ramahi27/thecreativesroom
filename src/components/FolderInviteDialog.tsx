import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { X, UserPlus, Users, Zap } from "lucide-react";

interface Collaborator {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
}

interface Props {
  folderId: string;
  folderName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FolderInviteDialog({ folderId, folderName, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { isPro, plan } = useSubscription();
  const isAdmin = plan === "admin" as any;
  const canUse = isPro || isAdmin;

  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loadingCollabs, setLoadingCollabs] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !canUse) return;
    fetchCollaborators();
  }, [open, folderId, canUse]);

  async function fetchCollaborators() {
    setLoadingCollabs(true);
    const { data: members } = await supabase
      .from("folder_members" as any)
      .select("id, user_id")
      .eq("folder_id", folderId);

    if (!members || (members as any[]).length === 0) {
      setCollaborators([]);
      setLoadingCollabs(false);
      return;
    }

    const userIds = (members as any[]).map((m: any) => m.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, username, avatar_url")
      .in("user_id", userIds);

    const profileMap: Record<string, any> = {};
    for (const p of profiles || []) profileMap[p.user_id] = p;

    setCollaborators(
      (members as any[]).map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        username: profileMap[m.user_id]?.username || "unknown",
        avatar_url: profileMap[m.user_id]?.avatar_url || null,
      }))
    );
    setLoadingCollabs(false);
  }

  async function handleInvite() {
    if (!username.trim() || !user) return;
    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id, username")
      .eq("username", username.trim().toLowerCase())
      .maybeSingle();

    if (!profile) {
      toast.error("User not found.");
      setLoading(false);
      return;
    }
    if (profile.user_id === user.id) {
      toast.error("You can't invite yourself.");
      setLoading(false);
      return;
    }
    if (collaborators.some((c) => c.user_id === profile.user_id)) {
      toast.error(`@${profile.username} already has access.`);
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("folder_members" as any)
      .insert({ folder_id: folderId, user_id: profile.user_id, invited_by: user.id });

    setLoading(false);
    if (error) { toast.error("Failed to invite user."); return; }

    toast.success(`@${profile.username} can now edit this folder.`);
    setUsername("");
    fetchCollaborators();
  }

  async function handleRemove(memberId: string, memberUsername: string) {
    setRemovingId(memberId);
    const { error } = await supabase
      .from("folder_members" as any)
      .delete()
      .eq("id", memberId);

    setRemovingId(null);
    if (error) { toast.error("Failed to remove collaborator."); return; }
    toast.success(`@${memberUsername} removed.`);
    setCollaborators((prev) => prev.filter((c) => c.id !== memberId));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-black tracking-tight flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" strokeWidth={1.5} />
            Invite to "{folderName}"
          </DialogTitle>
        </DialogHeader>

        {!canUse ? (
          <div className="py-6 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Zap className="h-5 w-5 text-primary" strokeWidth={1.5} />
            </div>
            <p className="font-body text-sm text-muted-foreground">
              Folder collaboration is a Pro feature.
            </p>
            <Button asChild className="rounded-full font-mono text-[10px] uppercase tracking-widest">
              <Link to="/pricing">Upgrade to Pro</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-5 pt-1">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground select-none">@</span>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/^@/, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") handleInvite(); }}
                  placeholder="username"
                  className="pl-7 bg-secondary/50 border border-border/60 font-mono rounded-xl transition-colors focus-visible:border-primary/60"
                />
              </div>
              <Button
                onClick={handleInvite}
                disabled={loading || !username.trim()}
                className="shrink-0 rounded-full font-mono text-[10px] uppercase tracking-widest gap-1.5"
              >
                <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
                {loading ? "…" : "Invite"}
              </Button>
            </div>

            {loadingCollabs ? (
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Loading…</p>
            ) : collaborators.length === 0 ? (
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                No collaborators yet — invite someone by username.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Has access</p>
                {collaborators.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-secondary/40">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full overflow-hidden bg-primary/10 shrink-0">
                        {c.avatar_url ? (
                          <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center font-display font-black text-xs text-primary">
                            {c.username.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <span className="font-mono text-[11px]">@{c.username}</span>
                    </div>
                    <button
                      onClick={() => handleRemove(c.id, c.username)}
                      disabled={removingId === c.id}
                      className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40 p-1"
                      aria-label={`Remove @${c.username}`}
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
