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

const Welcome = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = "Choose a username — The Creatives Room";
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
      .then(({ data }) => {
        if (data?.username) navigate(`/@${data.username}`);
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
    const { error } = await supabase
      .from("profiles")
      .upsert(
        { user_id: user.id, username: v.value },
        { onConflict: "user_id" },
      );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome!");
    navigate(`/@${v.value}`);
  }

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen grain">
      <SiteHeader />
      <main className="container max-w-md py-20">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-4">⏵ One last step</p>
        <h1 className="font-display text-5xl font-black tracking-tighter mb-4">Pick a username.</h1>
        <p className="font-body text-muted-foreground mb-8">
          This becomes your public page at thecreativesroom.com/@you.
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
              className="bg-secondary border-0 font-mono"
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
