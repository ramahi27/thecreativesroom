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
import { fetchThumbnail } from "@/lib/references";
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

const DAYS = 7;

type Ref = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  source_url: string | null;
  brand: string | null;
  agency: string | null;
  year: number | null;
  categories: string[];
  tags: string[] | null;
  notes: string | null;
  type: string;
  visual_summary: string | null;
};

const Newsletter = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [refs, setRefs] = useState<Ref[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [subject, setSubject] = useState("");
  const [intro, setIntro] = useState("");
  const [userCount, setUserCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => { document.title = "Newsletter — The Creatives Room"; }, []);

  const fetchRefs = useCallback(async () => {
    setLoadingRefs(true);
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("references")
      .select("id,title,thumbnail_url,source_url,brand,agency,year,categories,tags,notes,type,visual_summary")
      .eq("published", true)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10);
    const items = (data || []) as Ref[];
    // Backfill missing thumbnails from source_url (YouTube/Vimeo)
    const enriched = await Promise.all(
      items.map(async (r) => {
        if (r.thumbnail_url || !r.source_url) return r;
        const t = await fetchThumbnail(r.source_url).catch(() => null);
        return t ? { ...r, thumbnail_url: t } : r;
      }),
    );
    setRefs(enriched);
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

  async function send(testOnly = false) {
    const setLoading = testOnly ? setSendingTest : setSending;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { toast.error("Not authenticated"); return; }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-newsletter`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            subject,
            intro,
            refs,
            testEmail: testOnly ? "r.laith27@gmail.com" : undefined,
          }),
        },
      );
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || "Failed to send");
      } else {
        toast.success(testOnly ? "Test sent to r.laith27@gmail.com" : `Sent to ${result.sent} user${result.sent === 1 ? "" : "s"}`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    setConfirming(false);
    send(false);
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PageMeta title="Newsletter" description="Admin newsletter composer" noindex />
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

        {/* Intro */}
        <div className="space-y-1.5">
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Intro note <span className="opacity-50">(optional)</span></label>
          <textarea
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            rows={3}
            placeholder="A short personal note to open the email…"
            className="w-full font-body text-base bg-background border hairline rounded-md px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-ring"
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

        <p className="font-mono text-[10px] text-muted-foreground/60">
          AI will write a short blurb for each reference when you send.
        </p>

        {/* Send buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => send(true)}
            disabled={refs.length === 0 || !subject.trim() || sendingTest || sending || loadingRefs}
            className="font-mono text-xs uppercase tracking-widest shrink-0"
          >
            {sendingTest ? "Sending…" : "Send test"}
          </Button>
          <Button
            onClick={() => setConfirming(true)}
            disabled={refs.length === 0 || !subject.trim() || sending || sendingTest || loadingRefs}
            className="flex-1 font-mono text-xs uppercase tracking-widest"
            size="lg"
          >
            {sending ? "Sending…" : userCount !== null ? `Send to ${userCount} users` : "Send"}
          </Button>
        </div>
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
