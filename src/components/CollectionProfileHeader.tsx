import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Profile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExternalLink, MoreHorizontal, Pencil } from "lucide-react";
import { toast } from "sonner";
import { profileUrl, validateUsername } from "@/lib/username";
import { useNavigate } from "react-router-dom";
import { AvatarCropDialog } from "@/components/AvatarCropDialog";

interface Props {
  profile: Profile | null;
  loading: boolean;
  onSaved: () => void | Promise<void>;
}

export function CollectionProfileHeader({ profile, loading, onSaved }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  useEffect(() => {
    if (profile && editOpen) {
      setUsername(profile.username);
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatar_url || "");
    }
  }, [editOpen, profile]);

  function handlePickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast.error("Image too large (max 10MB).");
    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(reader.result as string);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleCroppedUpload(blob: Blob) {
    if (!user) return;
    setUploadingAvatar(true);
    const path = `avatars/${user.id}/${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("references")
      .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (upErr) {
      setUploadingAvatar(false);
      return toast.error(upErr.message);
    }
    const { data } = supabase.storage.from("references").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    setUploadingAvatar(false);
  }

  async function handleSaveProfile() {
    if (!user) return;
    const v = validateUsername(username);
    if (v.ok === false) return toast.error(v.error);
    setSavingProfile(true);
    if (!profile || profile.username !== v.value) {
      const { data: avail } = await supabase.rpc("username_available", {
        _username: v.value,
      });
      if (!avail) {
        setSavingProfile(false);
        return toast.error("That username is taken.");
      }
    }
    const { error } = await supabase.from("profiles").upsert(
      {
        user_id: user.id,
        username: v.value,
        bio: bio.trim() || null,
        avatar_url: avatarUrl || null,
      },
      { onConflict: "user_id" },
    );
    setSavingProfile(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved.");
    setEditOpen(false);
    await onSaved();
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters.");
    if (password !== confirm) return toast.error("Passwords don't match.");
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPw(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated.");
    setPassword("");
    setConfirm("");
    setPwOpen(false);
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
    <>
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
                  onClick={() => setEditOpen(true)}
                  className="font-mono text-[10px] uppercase tracking-widest h-8 gap-1.5"
                >
                  <Pencil className="h-3 w-3" strokeWidth={1.8} /> Edit profile
                </Button>
                {profile?.username && (
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="font-mono text-[10px] uppercase tracking-widest h-8 gap-1.5"
                  >
                    <Link to={`/@${profile.username}`}>
                      View public page <ExternalLink className="h-3 w-3" />
                    </Link>
                  </Button>
                )}
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
                    <DropdownMenuItem onClick={() => setPwOpen(true)}>
                      Change password
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
            </div>
          </div>
        </div>
      </section>

      {/* Edit profile */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Edit profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 font-serif">
            <div className="flex items-center gap-5">
              <div className="h-20 w-20 bg-secondary border hairline overflow-hidden flex items-center justify-center shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="font-mono text-[10px] text-muted-foreground">No avatar</span>
                )}
              </div>
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  className="font-mono text-[10px] uppercase tracking-widest"
                >
                  {uploadingAvatar ? "Uploading…" : avatarUrl ? "Change" : "Upload"}
                </Button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl("")}
                    className="ml-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-destructive"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Username
              </Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                pattern="^[a-z0-9_-]{3,24}$"
                className="bg-secondary border-0 font-mono"
              />
              <p className="font-mono text-[10px] text-muted-foreground">
                {profileUrl(username || "you")}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Bio
              </Label>
              <Textarea
                value={bio}
                maxLength={200}
                rows={3}
                onChange={(e) => setBio(e.target.value)}
                className="bg-secondary border-0 font-mono"
              />
              <p className="font-mono text-[10px] text-muted-foreground">{bio.length}/200</p>
            </div>
            <div>
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Email
              </Label>
              <p className="font-mono text-sm mt-1">{user?.email}</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditOpen(false)}
              className="font-mono text-xs uppercase tracking-widest"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="font-mono text-xs uppercase tracking-widest"
            >
              {savingProfile ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change password */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Change password</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                New password
              </Label>
              <Input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-secondary border-0 font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Confirm
              </Label>
              <Input
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="bg-secondary border-0 font-mono"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPwOpen(false)}
                className="font-mono text-xs uppercase tracking-widest"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingPw}
                className="font-mono text-xs uppercase tracking-widest"
              >
                {savingPw ? "Saving…" : "Update"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
