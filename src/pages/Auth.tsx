import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { SiteHeader } from "@/components/SiteHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

type Mode = "signin" | "signup" | "forgot";

const Auth = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("signin");
  const [loading, setLoading] = useState(false);
  const [signedUpEmail, setSignedUpEmail] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

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
        if (!agreed) {
          toast.error("Please accept the Terms of Service and Privacy Policy.");
          setLoading(false);
          return;
        }
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

          {mode !== "forgot" && (
            <>
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    or
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    const result = await lovable.auth.signInWithOAuth("google", {
                      redirect_uri: window.location.origin,
                    });
                    if (result.error) {
                      toast.error(result.error.message || "Google sign-in failed");
                      setLoading(false);
                      return;
                    }
                    if (result.redirected) return;
                    navigate("/");
                  } catch (err: any) {
                    toast.error(err.message || "Google sign-in failed");
                    setLoading(false);
                  }
                }}
                className="w-full font-mono text-xs uppercase tracking-widest h-12 gap-3"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
                </svg>
                Continue with Google
              </Button>
            </>
          )}

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
