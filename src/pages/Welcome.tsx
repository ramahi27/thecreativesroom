import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { validateUsername } from "@/lib/username";
import { PageMeta } from "@/components/PageMeta";

const Welcome = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    supabase
      .from("profiles")
      .select("username")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to check existing profile", error);
          return;
        }
        if (data?.username) navigate(`/u/${data.username}`);
      });
  }, [authLoading, user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const v = validateUsername(username);
    if (v.ok === false) {
      toast.error(v.error);
      return;
    }
    setSaving(true);
    const { data: avail } = await supabase.rpc("username_available", { _username: v.value });
    if (!avail) {
      setSaving(false);
      return toast.error("That username is taken.");
    }
    // SECURITY DEFINER RPC — creates the profile row if missing, otherwise
    // updates safe columns only. Direct table UPDATE is revoked by RLS hardening.
    const { error } = await supabase.rpc("update_my_profile", {
      p_username: v.value,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome!");
    navigate(`/u/${v.value}`);
  }

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen grain">
      <PageMeta
        title="Choose a username - The Creatives Room"
        description="Pick your username to complete your account setup."
        path="/welcome"
        noindex
      />
      <SiteHeader />
      <main className="container max-w-md py-20">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-4">⏵ One last step</p>
        <h1 className="font-display text-5xl font-black tracking-tighter mb-4">Pick a username.</h1>
        <p className="font-body text-muted-foreground mb-8">
          This becomes your public page at thecreativesroom.com/u/you.
        </p>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Username
            </Label>
            <Input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="yourname"
              className="bg-secondary/50 border border-border/60 font-mono rounded-xl transition-colors focus-visible:border-primary/60 focus-visible:bg-background"
            />
          </div>
          <Button type="submit" disabled={saving} className="w-full font-mono text-xs uppercase tracking-widest h-12">
            {saving ? "..." : "Continue"}
          </Button>
        </form>
      </main>
    </div>
  );
};

export default Welcome;
