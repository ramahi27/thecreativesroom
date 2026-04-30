import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const Account = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    document.title = "Account — The Creatives Room";
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
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
            <Button
              type="submit"
              disabled={saving}
              className="font-mono text-xs uppercase tracking-widest"
            >
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
    </div>
  );
};

export default Account;
