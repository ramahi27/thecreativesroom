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
import { Switch } from "@/components/ui/switch";
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

  const [subsPublic, setSubsPublic] = useState<boolean>(true);
  const [savingVisibility, setSavingVisibility] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  async function handleChangeEmail() {
    if (!newEmail.trim() || newEmail === user?.email) return;
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setSavingEmail(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Confirmation sent to " + newEmail.trim() + ". Check your inbox.");
    setNewEmail("");
  }

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
      setSubsPublic(profile.submissions_public !== false);
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
    const { error } = await supabase.rpc("update_my_profile", {
      p_username: v.value,
      p_bio: bio.trim() || null,
      p_avatar_url: avatarUrl || null,
    });
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

  async function handleToggleVisibility(v: boolean) {
    if (!user) return;
    setSavingVisibility(true);
    setSubsPublic(v);
    const { error } = await supabase
      .from("profiles")
      .update({ submissions_public: v })
      .eq("user_id", user.id);
    setSavingVisibility(false);
    if (error) { toast.error(error.message); setSubsPublic(!v); }
    else toast.success(v ? "Submissions are now public" : "Submissions are now private");
  }

  async function handleSendReset() {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent.");
  }

  type SettingsSection = "profile" | "account" | "visibility" | "billing" | "security";
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");

  if (authLoading || !user) return null;

  const navItems: { key: SettingsSection; label: string }[] = [
    { key: "profile", label: "Edit profile" },
    { key: "account", label: "Account management" },
    { key: "visibility", label: "Profile visibility" },
    { key: "billing", label: "Plan & billing" },
    { key: "security", label: "Security" },
  ];

  return (
    <div className="min-h-screen grain flex flex-col">
      <PageMeta title="My Profile — The Creatives Room" description="Manage your profile settings." noindex />
      <SiteHeader />
      <main className="flex-1">
        <div className="container py-10 flex flex-col md:flex-row gap-0 md:gap-12 max-w-4xl">

          {/* Left nav — desktop only */}
          <aside className="hidden md:flex flex-col gap-1 w-52 shrink-0 pt-2">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveSection(item.key)}
                className={`text-left px-3 py-2.5 rounded-xl font-body text-sm font-semibold transition-colors ${
                  activeSection === item.key
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </aside>

          {/* Right content */}
          <div className="flex-1 min-w-0">

          {/* Mobile nav — horizontal scrolling pills */}
          <div className="flex md:hidden gap-1 mb-6 overflow-x-auto pb-1 -mx-4 px-4">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveSection(item.key)}
                className={`shrink-0 px-3 py-2 rounded-full font-mono text-[10px] uppercase tracking-widest transition-colors ${
                  activeSection === item.key
                    ? "bg-foreground text-background"
                    : "text-muted-foreground border hairline hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
            {loading ? (
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading…</p>
            ) : (
              <>
                {/* ── Edit Profile ── */}
                {activeSection === "profile" && (
                  <div className="space-y-6">
                    <h2 className="font-display text-2xl font-black tracking-tight">Edit profile</h2>

                    {/* Avatar */}
                    <div className="flex flex-col items-center gap-3 pb-2">
                      <div className="relative group/av">
                        <div className="h-24 w-24 rounded-full overflow-hidden bg-secondary border-2 border-border">
                          {avatarUrl ? (
                            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center bg-primary/5">
                              <span className="font-display text-3xl font-black text-primary/40">
                                {(username || "?").slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover/av:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          <span className="font-mono text-[9px] uppercase tracking-widest text-white">Change</span>
                        </button>
                      </div>
                      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePickAvatar} />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border hairline rounded-full hover:border-foreground/40 transition-colors"
                        >
                          {uploadingAvatar ? "Uploading…" : "Change photo"}
                        </button>
                        {avatarUrl && (
                          <button
                            type="button"
                            onClick={() => setAvatarUrl("")}
                            className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border hairline rounded-full text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Fields */}
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label className="font-body text-sm font-semibold">Username</Label>
                        <Input
                          value={username}
                          onChange={(e) => setUsername(e.target.value.toLowerCase())}
                          pattern="^[a-z0-9_-]{3,24}$"
                          className="rounded-xl border border-border/60 bg-secondary/50 transition-colors focus-visible:border-primary/60 focus-visible:bg-background"
                        />
                        <p className="text-xs text-muted-foreground">{profileUrl(username || "you")}</p>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="font-body text-sm font-semibold">About</Label>
                        <Textarea
                          value={bio}
                          maxLength={200}
                          rows={3}
                          placeholder="Tell your story"
                          onChange={(e) => setBio(e.target.value)}
                          className="rounded-xl border border-border/60 bg-secondary/50 transition-colors focus-visible:border-primary/60 focus-visible:bg-background resize-none"
                        />
                        <p className="text-xs text-muted-foreground text-right">{bio.length}/200</p>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="font-body text-sm font-semibold">Email</Label>
                        <p className="text-sm text-muted-foreground px-3 py-2 rounded-xl bg-secondary/30">{user.email}</p>
                      </div>
                    </div>

                    <Button
                      onClick={handleSaveProfile}
                      disabled={savingProfile}
                      className="rounded-full font-mono text-xs uppercase tracking-widest px-6"
                    >
                      {savingProfile ? "Saving…" : "Save"}
                    </Button>
                  </div>
                )}

                {/* ── Plan & Billing ── */}
                {activeSection === "billing" && (
                  <div className="space-y-6">
                    <h2 className="font-display text-2xl font-black tracking-tight">Plan & billing</h2>
                    <div className="rounded-2xl border hairline p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-body text-sm font-semibold">Current plan</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {isPro ? "20 AI briefs/day · Unlimited folders" : "3 AI briefs/day · Up to 5 folders"}
                          </p>
                        </div>
                        <span className={`font-mono text-[10px] uppercase tracking-widest px-3 py-1 rounded-full ${isPro ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                          {isPro ? "Pro" : "Free"}
                        </span>
                      </div>
                      {isPro ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleManageBilling}
                          disabled={portalLoading}
                          className="rounded-full font-mono text-xs uppercase tracking-widest"
                        >
                          {portalLoading ? "Loading…" : "Manage billing"}
                        </Button>
                      ) : (
                        <Link to="/pricing">
                          <Button className="rounded-full font-mono text-xs uppercase tracking-widest">
                            Upgrade to Pro
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Account Management ── */}
                {activeSection === "account" && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="font-display text-2xl font-black tracking-tight">Account management</h2>
                      <p className="text-sm text-muted-foreground mt-1">Make changes to your personal information or account type.</p>
                    </div>

                    {/* Your account */}
                    <div className="space-y-3">
                      <h3 className="font-body text-base font-semibold">Your account</h3>
                      <div className="rounded-xl border hairline bg-secondary/30 px-4 py-3">
                        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Current email · Private</p>
                        <p className="text-sm mt-0.5">{user.email}</p>
                        <span className="inline-block mt-1.5 font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/10 text-primary">Confirmed</span>
                      </div>
                      <div className="rounded-xl border hairline p-4 space-y-3">
                        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Change email</p>
                        <div className="flex gap-2">
                          <Input
                            type="email"
                            placeholder="New email address"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleChangeEmail(); }}
                            className="rounded-xl bg-secondary/60 border-border text-sm"
                          />
                          <Button
                            type="button"
                            onClick={handleChangeEmail}
                            disabled={savingEmail || !newEmail.trim() || newEmail === user.email}
                            className="shrink-0 rounded-full font-mono text-[10px] uppercase tracking-widest"
                          >
                            {savingEmail ? "Saving…" : "Update"}
                          </Button>
                        </div>
                        <p className="font-body text-xs text-muted-foreground">A confirmation link will be sent to the new address.</p>
                      </div>
                    </div>

                    {/* Deactivation and deletion */}
                    <div className="space-y-3">
                      <h3 className="font-body text-base font-semibold">Deactivation and deletion</h3>
                      <div className="rounded-2xl border border-destructive/20 p-5 space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-body text-sm font-semibold">Delete your data and account</p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              Permanently deletes your account and all data. Submitted references stay but are anonymised.
                            </p>
                          </div>
                          {!showDeleteZone && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setShowDeleteZone(true)}
                              className="shrink-0 rounded-full font-mono text-[10px] uppercase tracking-widest border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                            >
                              Delete account
                            </Button>
                          )}
                        </div>
                        {showDeleteZone && (
                          <div className="space-y-3 pt-1">
                            <p className="font-mono text-[10px] uppercase tracking-widest text-destructive">
                              Type <strong>{profile?.username}</strong> to confirm
                            </p>
                            <Input
                              value={deleteConfirm}
                              onChange={(e) => setDeleteConfirm(e.target.value)}
                              placeholder={profile?.username}
                              className="rounded-xl border-destructive/30 bg-secondary/50"
                              autoComplete="off"
                            />
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                onClick={handleDeleteAccount}
                                disabled={deleteConfirm !== profile?.username || deleting}
                                className="rounded-full font-mono text-[10px] uppercase tracking-widest bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {deleting ? "Deleting…" : "Permanently delete"}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => { setShowDeleteZone(false); setDeleteConfirm(""); }}
                                className="rounded-full font-mono text-[10px] uppercase tracking-widest"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Profile Visibility ── */}
                {activeSection === "visibility" && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="font-display text-2xl font-black tracking-tight">Profile visibility</h2>
                      <p className="text-sm text-muted-foreground mt-1">Manage how your profile can be viewed by others.</p>
                    </div>
                    <div className="space-y-4">
                      <div className="rounded-2xl border hairline p-5 flex items-start justify-between gap-4">
                        <div>
                          <p className="font-body text-sm font-semibold">Public submissions</p>
                          <p className="text-sm text-muted-foreground mt-0.5 max-w-sm">
                            When enabled, your submitted references are visible on your public profile. Disable to keep them private.
                          </p>
                        </div>
                        <Switch
                          checked={subsPublic}
                          disabled={savingVisibility}
                          onCheckedChange={handleToggleVisibility}
                          className="mt-0.5 shrink-0"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Security ── */}
                {activeSection === "security" && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="font-display text-2xl font-black tracking-tight">Security</h2>
                      <p className="text-sm text-muted-foreground mt-1">Manage your password and account access.</p>
                    </div>

                    <div className="rounded-2xl border hairline p-5 space-y-4">
                      <h3 className="font-body text-base font-semibold">Password</h3>
                      <form onSubmit={handleChangePassword} className="space-y-4">
                        <div className="space-y-1.5">
                          <Label className="font-body text-sm font-semibold">New password</Label>
                          <Input
                            type="password"
                            required
                            minLength={6}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="rounded-xl border-border bg-secondary/50"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="font-body text-sm font-semibold">Confirm password</Label>
                          <Input
                            type="password"
                            required
                            minLength={6}
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className="rounded-xl border-border bg-secondary/50"
                          />
                        </div>
                        <div className="flex gap-3">
                          <Button type="submit" disabled={savingPw} className="rounded-full font-mono text-xs uppercase tracking-widest px-6">
                            {savingPw ? "Saving…" : "Change"}
                          </Button>
                          <Button type="button" variant="ghost" onClick={handleSendReset} className="rounded-full font-mono text-xs uppercase tracking-widest">
                            Send reset email
                          </Button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
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
