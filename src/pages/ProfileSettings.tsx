import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useProfile";
import { useSubscription, invalidateSubscription } from "@/hooks/useSubscription";
import { SiteHeader } from "@/components/SiteHeader";
import { PageMeta } from "@/components/PageMeta";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { profileUrl, validateUsername } from "@/lib/username";
import { AvatarCropDialog } from "@/components/AvatarCropDialog";

const ProfileSettings = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile, loading, refresh } = useMyProfile();
  const { isPro, plan } = useSubscription();
  const [portalLoading, setPortalLoading] = useState(false);

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

  const [showDeleteZone, setShowDeleteZone] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    document.title = "My Profile — The Creatives Room";
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      invalidateSubscription();
      toast.success("You're now on Pro. Welcome!");
      navigate("/account/edit", { replace: true });
    }
  }, [searchParams, navigate]);

  async function handleManageBilling() {
    setPortalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/customer-portal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ returnUrl: window.location.href }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || "Could not open billing portal.");
      window.location.href = json.url;
    } catch (err: any) {
      toast.error(err.message);
      setPortalLoading(false);
    }
  }

  useEffect(() => {
    if (profile) {
      setUsername(profile.username);
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatar_url || "");
    }
  }, [profile]);

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
      toast.error(upErr.message);
      return;
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
      const { data: avail } = await supabase.rpc("username_available", { _username: v.value });
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
    await refresh();
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
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== profile?.username || deleting) return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Deletion failed");
      await supabase.auth.signOut();
      navigate("/");
    } catch (err: any) {
      toast.error(err.message);
      setDeleting(false);
    }
  }

  async function handleSendReset() {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent.");
  }

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen grain flex flex-col">
      <PageMeta title="My Profile — The Creatives Room" description="Manage your profile settings." noindex />
      <SiteHeader />
      <main className="container py-12 md:py-16 flex-1 max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-3">⏵ My Profile</p>
        <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter mb-10">
          Edit profile
        </h1>

        {loading ? (
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-10">
            <section className="space-y-6">
              <div className="flex items-center gap-5">
                <div className="h-24 w-24 bg-secondary border hairline overflow-hidden flex items-center justify-center shrink-0">
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
                    onChange={handlePickAvatar}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    className="font-mono text-[10px] uppercase tracking-widest"
                  >
                    {uploadingAvatar ? "Uploading…" : avatarUrl ? "Change photo" : "Upload photo"}
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
                <p className="font-mono text-sm mt-1">{user.email}</p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="font-mono text-xs uppercase tracking-widest"
                >
                  {savingProfile ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </section>

            <div className="border-t hairline" />

            {/* Billing */}
            <section className="space-y-4">
              <h2 className="font-display text-2xl font-bold tracking-tight">Plan & Billing</h2>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Current plan</span>
                <span className={`font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 ${isPro ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                  {isPro ? "Pro" : "Free"}
                </span>
              </div>
              {isPro ? (
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleManageBilling}
                    disabled={portalLoading}
                    className="font-mono text-[10px] uppercase tracking-widest"
                  >
                    {portalLoading ? "Loading…" : "Manage billing"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="font-body text-sm text-muted-foreground">
                    Upgrade to Pro for 20 AI brief matches per day and unlimited folders.
                  </p>
                  <Link to="/pricing">
                    <Button className="font-mono text-[10px] uppercase tracking-widest">
                      Upgrade to Pro
                    </Button>
                  </Link>
                </div>
              )}
            </section>

            <div className="border-t hairline" />

            <section className="space-y-4">
              <h2 className="font-display text-2xl font-bold tracking-tight">Change password</h2>
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
                    Confirm password
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
                <div className="flex items-center gap-3">
                  <Button
                    type="submit"
                    disabled={savingPw}
                    className="font-mono text-xs uppercase tracking-widest"
                  >
                    {savingPw ? "Saving…" : "Update password"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleSendReset}
                    className="font-mono text-xs uppercase tracking-widest"
                  >
                    Send reset email
                  </Button>
                </div>
              </form>
            </section>
            <div className="border-t hairline" />

            <section className="space-y-4">
              <h2 className="font-display text-2xl font-bold tracking-tight text-destructive">Danger zone</h2>
              <p className="font-body text-sm text-muted-foreground">
                Permanently delete your account and all associated data. This cannot be undone.
                Your submitted references will stay in the archive but will be anonymised.
              </p>
              {!showDeleteZone ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDeleteZone(true)}
                  className="font-mono text-[10px] uppercase tracking-widest border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                >
                  Delete my account
                </Button>
              ) : (
                <div className="border hairline border-destructive/30 rounded-lg p-4 space-y-3">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-destructive">
                    Type <strong className="font-black">{profile?.username}</strong> to confirm deletion
                  </p>
                  <Input
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder={profile?.username}
                    className="bg-secondary border-0 font-mono"
                    autoComplete="off"
                  />
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirm !== profile?.username || deleting}
                      className="font-mono text-[10px] uppercase tracking-widest bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleting ? "Deleting…" : "Permanently delete"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => { setShowDeleteZone(false); setDeleteConfirm(""); }}
                      className="font-mono text-[10px] uppercase tracking-widest"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
      <SiteFooter />
      <AvatarCropDialog
        src={cropSrc}
        open={cropOpen}
        onOpenChange={setCropOpen}
        onCropped={handleCroppedUpload}
      />
    </div>
  );
};

export default ProfileSettings;
