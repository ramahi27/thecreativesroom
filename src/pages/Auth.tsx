import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { SiteHeader } from "@/components/SiteHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Mode = "signin" | "signup" | "forgot";

const Auth = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("signin");
  const [loading, setLoading] = useState(false);
  const [signedUpEmail, setSignedUpEmail] = useState<string | null>(null);

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
        setSignedUpEmail(email);
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Password reset link sent. Check your email.");
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

  const heading =
    mode === "signin" ? "Sign in." : mode === "signup" ? "Create account." : "Reset password.";
  const eyebrow =
    mode === "signin" ? "Access" : mode === "signup" ? "Register" : "Recover";
  const submitLabel =
    mode === "signin" ? "Enter Archive" : mode === "signup" ? "Create Account" : "Send reset link";

  return (
    <div className="min-h-screen grain">
      <SiteHeader />
      {signedUpEmail ? (
        <main className="container flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center text-center py-20">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-6">
            ⏵ Check your inbox
          </p>
          <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter mb-8 max-w-3xl">
            Confirm your email to finish signing up.
          </h1>
          <p className="font-body text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed mb-10">
            We just sent a confirmation link to{" "}
            <span className="text-foreground font-medium">{signedUpEmail}</span>. Click it to activate your account, then come back and sign in.
          </p>
          <Button
            onClick={() => {
              setSignedUpEmail(null);
              setMode("signin");
              setPassword("");
            }}
            className="font-mono text-xs uppercase tracking-widest h-12 px-8"
          >
            Back to sign in
          </Button>
        </main>
      ) : (
      <main className="container max-w-md py-20">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-4">
          ⏵ {eyebrow}
        </p>
        <h1 className="font-display text-5xl font-black tracking-tighter mb-8">
          {heading}
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
          {mode !== "forgot" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Password</Label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => setMode("forgot")}
                    className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Forgot?
                  </button>
                )}
              </div>
              <Input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-secondary border-0 font-mono"
              />
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full font-mono text-xs uppercase tracking-widest h-12">
            {loading ? "..." : submitLabel}
          </Button>

          {mode === "forgot" ? (
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="w-full text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to sign in
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="w-full text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
            >
              {mode === "signin" ? "Need an account? Register →" : "← Back to sign in"}
            </button>
          )}
        </form>
      </main>
      )}
    </div>
  );
};

export default Auth;
