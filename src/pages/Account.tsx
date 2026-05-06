import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useProfile";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { validateUsername, profileUrl } from "@/lib/username";
import { ExternalLink } from "lucide-react";

const Account = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading, refresh } = useMyProfile();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  // Profile form
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    document.title = "Account — The Creatives Room";
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (profile) {
      setUsername(profile.username);
      setDisplayName(profile.display_name || "");
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatar_url || "");
    }
  }, [profile]);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters.");
    if (password !== confirm) return toast.error("Passwords don't match.");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Password updated.");
      setPassword("");
      setConfirm("");
    }
  }

  async function handleSendReset() {
    if (!user?.email) return;
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSendingReset(false);
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent.");
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!user) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Image too large (max 5MB).");
    setUploadingAvatar(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `avatars/${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("references").upload(path, file, {
      upsert: true,
      contentType: file.type,
    });
    if (upErr) {
      setUploadingAvatar(false);
      return toast.error(upErr.message);
    }
    const { data } = supabase.storage.from("references").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    setUploadingAvatar(false);
    toast.success("Avatar uploaded — don't forget to save.");
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const v = validateUsername(username);
    if (v.ok === false) {
      toast.error(v.error);
      return;
    }
    setSavingProfile(true);
    // If username changed, check availability
    if (!profile || profile.username !== v.value) {
      const { data: avail } = await supabase.rpc("username_available", { _username: v.value });
      if (!avail) {
        setSavingProfile(false);
        return toast.error("That username is taken.");
      }
    }
    const payload = {
      user_id: user.id,
      username: v.value,
      display_name: displayName.trim() || null,
      bio: bio.trim() || null,
      avatar_url: avatarUrl || null,
    };
    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });
    setSavingProfile(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved.");
    await refresh();
  }

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen grain">
      <SiteHeader />

      <section className="border-b hairline">
        <div className="container py-12 md:py-16">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-4">⏵ Account</p>
          <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[0.9]">
            Your <span className="italic font-light">account</span>.
          </h1>
        </div>
      </section>

      <main className="container py-12 max-w-2xl space-y-12 font-serif">
        <section>
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="text-2xl font-black tracking-tighter font-serif">Public profile</h2>
            {profile?.username && (
              <Link
                to={`/@${profile.username}`}
                className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                View <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>

          {profileLoading ? (
            <p className="font-mono text-xs text-muted-foreground">Loading…</p>
          ) : (
            <form onSubmit={handleSaveProfile} className="space-y-5">
              <div className="flex items-center gap-5">
                <div className="h-20 w-20 bg-secondary border hairline overflow-hidden flex items-center justify-center shrink-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">No avatar</span>
                  )}
                </div>
                <div>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                  <label
                    htmlFor="avatar-upload"
                    className="inline-block px-3 py-2 border hairline font-mono text-[11px] uppercase tracking-widest hover:bg-secondary cursor-pointer"
                  >
                    {uploadingAvatar ? "Uploading…" : avatarUrl ? "Change" : "Upload avatar"}
                  </label>
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => setAvatarUrl("")}
                      className="ml-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-destructive"
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
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  pattern="^[a-z0-9_-]{3,24}$"
                  className="bg-secondary border-0 font-mono"
                />
                <p className="font-mono text-[10px] text-muted-foreground">
                  {profileUrl(username || (profile?.username || "you"))}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Display name
                </Label>
                <Input
                  value={displayName}
                  maxLength={60}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="bg-secondary border-0 font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Bio
                </Label>
                <Textarea
                  value={bio}
                  maxLength={200}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  className="bg-secondary border-0 font-mono"
                />
                <p className="font-mono text-[10px] text-muted-foreground">{bio.length}/200</p>
              </div>

              <Button type="submit" disabled={savingProfile} className="font-mono text-xs uppercase tracking-widest">
                {savingProfile ? "Saving…" : "Save profile"}
              </Button>
            </form>
          )}
        </section>

        <section>
          <h2 className="text-2xl font-black tracking-tighter font-serif mb-2">Email</h2>
          <p className="font-mono text-sm text-muted-foreground">{user.email}</p>
        </section>

        <section>
          <h2 className="text-2xl font-black tracking-tighter font-serif mb-6">Change password</h2>
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
                Confirm new password
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
            <Button type="submit" disabled={saving} className="font-mono text-xs uppercase tracking-widest">
              {saving ? "Saving…" : "Update password"}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t hairline">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-3">
              Forgot your current password?
            </p>
            <Button
              variant="outline"
              onClick={handleSendReset}
              disabled={sendingReset}
              className="font-mono text-xs uppercase tracking-widest"
            >
              {sendingReset ? "Sending…" : "Send reset email"}
            </Button>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-black tracking-tighter font-serif mb-4">Sign out</h2>
          <Button
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/");
            }}
            className="font-mono text-xs uppercase tracking-widest"
          >
            Sign out
          </Button>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Account;
