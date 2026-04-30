import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.title = "Reset password — The Creatives Room";
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated.");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Could not update password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grain">
      <SiteHeader />
      <main className="container max-w-md py-20">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-4">⏵ Recover</p>
        <h1 className="font-display text-5xl font-black tracking-tighter mb-8">New password.</h1>

        {!ready ? (
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Open this page from the reset link in your email.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">New password</Label>
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
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Confirm password</Label>
              <Input
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="bg-secondary border-0 font-mono"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full font-mono text-xs uppercase tracking-widest h-12">
              {loading ? "..." : "Update password"}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
};

export default ResetPassword;
