import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { PageMeta } from "@/components/PageMeta";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const Newsletter = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [subject, setSubject] = useState("");
  const [preview, setPreview] = useState("");
  const [body, setBody] = useState("");
  const [userCount, setUserCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    document.title = "Newsletter — The Creatives Room";
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    (supabase as any).rpc("get_user_overview").then(({ data }: any) => {
      if (Array.isArray(data)) {
        const withEmail = data.filter((u: any) => typeof u.email === "string" && u.email.includes("@"));
        setUserCount(withEmail.length);
      }
    });
  }, [isAdmin]);

  if (authLoading) return null;
  if (!user || !isAdmin) return <Navigate to="/" replace />;

  async function handleSend() {
    setConfirming(false);
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { toast.error("Not authenticated"); return; }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-newsletter`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ subject, preview, html: body.replace(/\n/g, "<br>") }),
        },
      );
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || "Failed to send");
      } else {
        toast.success(`Sent to ${result.sent} user${result.sent === 1 ? "" : "s"}`);
        setSubject("");
        setPreview("");
        setBody("");
      }
    } catch (e: any) {
      toast.error(e?.message || "Unknown error");
    } finally {
      setSending(false);
    }
  }

  const canSend = subject.trim().length > 0 && body.trim().length > 0 && !sending;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PageMeta title="Newsletter" />
      <SiteHeader />

      <main className="flex-1 container max-w-2xl py-12 space-y-8">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary mb-2">⏵ Admin</p>
          <h1 className="font-display text-4xl font-black tracking-tighter leading-none">Newsletter</h1>
          {userCount !== null && (
            <p className="font-mono text-xs text-muted-foreground mt-2">
              {userCount} recipient{userCount === 1 ? "" : "s"} with email addresses
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Subject</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. New references this week"
              className="font-body"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Preview text <span className="opacity-50">(shows under subject in inbox)</span>
            </label>
            <Input
              value={preview}
              onChange={(e) => setPreview(e.target.value)}
              placeholder="e.g. Fresh picks from the archive…"
              className="font-body"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message here. Line breaks are preserved."
              rows={14}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-body placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            />
          </div>

          <Button
            onClick={() => setConfirming(true)}
            disabled={!canSend}
            className="font-mono text-xs uppercase tracking-widest"
          >
            {sending
              ? "Sending…"
              : userCount !== null
              ? `Send to all users (${userCount})`
              : "Send to all users"}
          </Button>
        </div>
      </main>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send newsletter?</AlertDialogTitle>
            <AlertDialogDescription>
              This will email <strong>{userCount ?? "all"} users</strong> with subject "{subject}". This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSend}>Send</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SiteFooter />
    </div>
  );
};

export default Newsletter;
