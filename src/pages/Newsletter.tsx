import { useEffect, useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { PageMeta } from "@/components/PageMeta";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
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

const SITE_URL = "https://thecreativesroom.com";
const DAYS = 7;

type Ref = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  source_url: string | null;
  brand: string | null;
  categories: string[];
  type: string;
};

function refUrl(r: Ref): string {
  const slug = r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${SITE_URL}/ref/${r.id}${slug ? `-${slug}` : ""}`;
}

function buildHtml(refs: Ref[], subject: string): string {
  const rows = refs.map((r) => {
    const url = refUrl(r);
    const thumb = r.thumbnail_url
      ? `<img src="${r.thumbnail_url}" alt="${r.title.replace(/"/g, "&quot;")}" width="560" style="width:100%;max-width:560px;height:200px;object-fit:cover;display:block;border-radius:8px 8px 0 0;" />`
      : `<div style="width:100%;height:120px;background:#1a1a1a;border-radius:8px 8px 0 0;"></div>`;
    const meta = [r.brand, r.categories?.[0]].filter(Boolean).join(" · ");
    return `
<tr><td style="padding:0 0 24px 0;">
  <a href="${url}" style="display:block;text-decoration:none;background:#111;border-radius:8px;overflow:hidden;border:1px solid #222;">
    ${thumb}
    <div style="padding:16px 20px;">
      <p style="margin:0 0 4px 0;font-family:Georgia,serif;font-size:18px;font-weight:700;color:#f5f0e8;line-height:1.3;">${r.title}</p>
      ${meta ? `<p style="margin:0;font-family:monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#888;">${meta}</p>` : ""}
    </div>
  </a>
</td></tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

        <!-- Header -->
        <tr><td style="padding:0 0 32px 0;border-bottom:1px solid #222;">
          <p style="margin:0;font-family:monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.3em;color:#f46a20;">⏵ The Creatives Room</p>
          <h1 style="margin:8px 0 0 0;font-family:Georgia,serif;font-size:28px;font-weight:900;color:#f5f0e8;letter-spacing:-0.02em;line-height:1.1;">${subject}</h1>
        </td></tr>

        <!-- References -->
        <tr><td style="padding:32px 0 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${rows}
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 0 0 0;border-top:1px solid #222;">
          <p style="margin:0;font-family:monospace;font-size:10px;color:#555;text-align:center;">
            You're receiving this because you have an account on <a href="${SITE_URL}" style="color:#f46a20;">thecreativesroom.com</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const Newsletter = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [refs, setRefs] = useState<Ref[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [subject, setSubject] = useState("");
  const [userCount, setUserCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => { document.title = "Newsletter — The Creatives Room"; }, []);

  const fetchRefs = useCallback(async () => {
    setLoadingRefs(true);
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("references")
      .select("id,title,thumbnail_url,source_url,brand,categories,type")
      .eq("published", true)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10);
    const items = (data || []) as Ref[];
    setRefs(items);
    if (!subject) {
      const now = new Date();
      const week = `${now.toLocaleString("default", { month: "long" })} ${now.getDate()}`;
      setSubject(`New this week — ${week}`);
    }
    setLoadingRefs(false);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetchRefs();
    (supabase as any).rpc("get_user_overview").then(({ data }: any) => {
      if (Array.isArray(data)) {
        setUserCount(data.filter((u: any) => typeof u.email === "string" && u.email.includes("@")).length);
      }
    });
  }, [isAdmin, fetchRefs]);

  if (authLoading) return null;
  if (!user || !isAdmin) return <Navigate to="/" replace />;

  async function handleSend() {
    setConfirming(false);
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { toast.error("Not authenticated"); return; }

      const html = buildHtml(refs, subject);
      const preview = `${refs.length} new reference${refs.length === 1 ? "" : "s"} added this week`;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-newsletter`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ subject, preview, html }),
        },
      );
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || "Failed to send");
      } else {
        toast.success(`Sent to ${result.sent} user${result.sent === 1 ? "" : "s"}`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Unknown error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PageMeta title="Newsletter" />
      <SiteHeader />

      <main className="flex-1 container max-w-2xl py-12 space-y-8">
        {/* Header */}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary mb-2">⏵ Admin</p>
          <h1 className="font-display text-4xl font-black tracking-tighter leading-none">Newsletter</h1>
          {userCount !== null && (
            <p className="font-mono text-xs text-muted-foreground mt-2">
              {userCount} recipient{userCount === 1 ? "" : "s"} · last {DAYS} days
            </p>
          )}
        </div>

        {/* Subject */}
        <div className="space-y-1.5">
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Subject line</label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="font-body text-base"
          />
        </div>

        {/* References preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {loadingRefs ? "Loading…" : `${refs.length} reference${refs.length === 1 ? "" : "s"} from the last ${DAYS} days`}
            </label>
            <button onClick={fetchRefs} className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          </div>

          {refs.length === 0 && !loadingRefs ? (
            <p className="font-mono text-xs text-muted-foreground py-6 text-center border hairline rounded-xl">
              No new references in the last {DAYS} days.
            </p>
          ) : (
            <div className="space-y-3">
              {refs.map((r) => (
                <div key={r.id} className="flex gap-3 items-center bg-card border hairline rounded-xl overflow-hidden p-3">
                  {r.thumbnail_url ? (
                    <img src={r.thumbnail_url} alt={r.title} className="w-16 h-12 object-cover rounded-lg shrink-0" />
                  ) : (
                    <div className="w-16 h-12 bg-secondary rounded-lg shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-display font-light text-sm leading-snug truncate">{r.title}</p>
                    {(r.brand || r.categories?.[0]) && (
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 truncate mt-0.5">
                        {[r.brand, r.categories?.[0]].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Send button */}
        <Button
          onClick={() => setConfirming(true)}
          disabled={refs.length === 0 || !subject.trim() || sending || loadingRefs}
          className="w-full font-mono text-xs uppercase tracking-widest"
          size="lg"
        >
          {sending ? "Sending…" : userCount !== null ? `Send to ${userCount} users` : "Send"}
        </Button>
      </main>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send newsletter?</AlertDialogTitle>
            <AlertDialogDescription>
              This will email <strong>{userCount ?? "all"} users</strong> with {refs.length} reference{refs.length === 1 ? "" : "s"}. This cannot be undone.
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
