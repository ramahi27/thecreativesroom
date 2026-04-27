import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const Auth = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Sign in — The Creatives Room";
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/");
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("Account created. You can sign in now.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grain">
      <SiteHeader />
      <main className="container max-w-md py-20">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-4">
          ⏵ {mode === "signin" ? "Access" : "Register"}
        </p>
        <h1 className="font-display text-5xl font-black tracking-tighter mb-8">
          {mode === "signin" ? "Sign in." : "Create account."}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Email</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-secondary border-0 font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Password</Label>
            <Input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-secondary border-0 font-mono"
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full font-mono text-xs uppercase tracking-widest h-12">
            {loading ? "..." : mode === "signin" ? "Enter Archive" : "Create Account"}
          </Button>

          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="w-full text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            {mode === "signin" ? "Need an account? Register →" : "← Back to sign in"}
          </button>
        </form>

        <p className="mt-12 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60 leading-relaxed">
          Note: Only the archive admin can add references. New accounts are read-only by default.
        </p>
      </main>
    </div>
  );
};

export default Auth;
