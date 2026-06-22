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
import { RefreshCw, X, Sparkles, ExternalLink } from "lucide-react";
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

const DAYS = 60;

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
  const [subject, setSubject] = useState(() => {
    const now = new Date();
    return `New this week — ${now.toLocaleString("default", { month: "long" })} ${now.getDate()}`;
  });
  const [intro, setIntro] = useState("");
  const [userCount, setUserCount] = useState<number | null>(null);
  const [theme, setTheme] = useState("");
  const [subjectIsCustom, setSubjectIsCustom] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [aiPreview, setAiPreview] = useState<{ subject: string; intro: string } | null>(null);
  const [addUrl, setAddUrl] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);

  useEffect(() => { document.title = "Newsletter - The Creatives Room"; }, []);

  const fetchRefs = useCallback(async (shuffle = false) => {
    setLoadingRefs(true);
    try {
      const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
      // Pull a wider pool so refresh can re-sample a different 30
      const { data } = await supabase
        .from("references")
        .select("id,title,thumbnail_url,source_url,brand,agency,year,categories,tags,notes,type,visual_summary")
        .eq("published", true)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(150);
      let items = (data || []) as Ref[];
      if (shuffle) {
        // Fisher–Yates shuffle so each refresh gives the AI a different candidate slice
        for (let i = items.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [items[i], items[j]] = [items[j], items[i]];
        }
      }
      items = items.slice(0, 30);
      const enriched = await Promise.all(
        items.map(async (r) => {
          if (r.thumbnail_url || !r.source_url) return r;
          const t = await fetchThumbnail(r.source_url).catch(() => null);
          return t ? { ...r, thumbnail_url: t } : r;
        }),
      );
      setRefs(enriched);
      if (shuffle) toast.success(`${enriched.length} fresh candidate${enriched.length === 1 ? "" : "s"} loaded`);
    } finally {
      setLoadingRefs(false);
    }
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

  async function callEdgeFunction(body: object) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Not authenticated");
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-newsletter`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      },
    );
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Failed");
    return result;
  }

  async function generate() {
    setGenerating(true);
    setAiPreview(null);
    try {
      const result = await callEdgeFunction({
        subject,
        intro: "",
        theme: theme.trim() || undefined,
        subjectIsCustom,
        refs,
        previewOnly: true,
      });
      if (result.generatedSubject || result.generatedIntro) {
        setAiPreview({ subject: result.generatedSubject || "", intro: result.generatedIntro || "" });
      } else {
        toast.error("AI returned no content");
      }
    } catch (e: any) {
      toast.error(e?.message || "Unknown error");
    } finally {
      setGenerating(false);
    }
  }

  async function send(testOnly = false) {
    const setLoading = testOnly ? setSendingTest : setSending;
    setLoading(true);
    try {
      const result = await callEdgeFunction({
        subject,
        intro,
        theme: theme.trim() || undefined,
        subjectIsCustom,
        refs,
        testEmail: testOnly ? "r.laith27@gmail.com" : undefined,
      });
      toast.success(testOnly ? "Test sent to r.laith27@gmail.com" : `Sent to ${result.sent} user${result.sent === 1 ? "" : "s"}`);
      if (result.generatedSubject || result.generatedIntro) {
        setAiPreview({ subject: result.generatedSubject || "", intro: result.generatedIntro || "" });
      }
    } catch (e: any) {
      toast.error(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function addByUrl() {
    const url = addUrl.trim();
    if (!url) return;
    setAddingUrl(true);
    try {
      const { data, error } = await supabase
        .from("references")
        .select("id,title,thumbnail_url,source_url,brand,agency,year,categories,tags,notes,type,visual_summary")
        .eq("source_url", url)
        .eq("published", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.error("No published reference found for that URL");
        return;
      }
      if (refs.find((r) => r.id === data.id)) {
        toast.error("Already in the list");
        return;
      }
      let ref = data as Ref;
      if (!ref.thumbnail_url && ref.source_url) {
        const t = await fetchThumbnail(ref.source_url).catch(() => null);
        if (t) ref = { ...ref, thumbnail_url: t };
      }
      setRefs((prev) => [ref, ...prev]);
      setAddUrl("");
      toast.success(`Added: ${ref.title}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to find reference");
    } finally {
      setAddingUrl(false);
    }
  }

  function handleSend() {
    setConfirming(false);
    send(false);
  }

  const busy = sending || sendingTest || generating || loadingRefs;

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
            onChange={(e) => { setSubject(e.target.value); setSubjectIsCustom(true); }}
            className="font-body text-base"
          />
          <p className="font-mono text-[10px] text-muted-foreground/50">AI will generate a timely subject unless you edit this</p>
        </div>

        {/* Theme / current events */}
        <div className="space-y-1.5">
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Current events / focus <span className="opacity-50">(optional)</span></label>
          <Input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="e.g. Cannes 2026, World Cup, summer fashion…"
            className="font-body text-base"
          />
          <p className="font-mono text-[10px] text-muted-foreground/50">AI uses this to pick the most relevant refs from the pool</p>
        </div>

        {/* References list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {loadingRefs ? "Loading…" : `${refs.length} candidate${refs.length === 1 ? "" : "s"} · AI picks the most relevant`}
            </label>
            <button onClick={() => fetchRefs(true)} className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
              <RefreshCw className={`h-3 w-3 ${loadingRefs ? "animate-spin" : ""}`} />
              {loadingRefs ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {refs.length === 0 && !loadingRefs ? (
            <p className="font-mono text-xs text-muted-foreground py-6 text-center border hairline rounded-xl">
              No new references in the last {DAYS} days.
            </p>
          ) : (
            <div className="space-y-2">
              {refs.map((r) => (
                <div key={r.id} className="flex gap-3 items-center bg-card border hairline rounded-xl overflow-hidden p-3 group">
                  {r.thumbnail_url ? (
                    <img src={r.thumbnail_url} alt={r.title} className="w-16 h-12 object-cover rounded-lg shrink-0" />
                  ) : (
                    <div className="w-16 h-12 bg-secondary rounded-lg shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-light text-sm leading-snug truncate">{r.title}</p>
                    {(r.brand || r.categories?.[0]) && (
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 truncate mt-0.5">
                        {[r.brand, r.categories?.[0]].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a
                      href={`/ref/${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Open reference"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button
                      onClick={() => setRefs((prev) => prev.filter((x) => x.id !== r.id))}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors"
                      title="Remove from list"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add by URL */}
          <div className="flex gap-2 pt-1">
            <Input
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addByUrl(); }}
              placeholder="Paste a source URL to add a reference…"
              className="font-body text-sm"
            />
            <Button
              variant="outline"
              onClick={addByUrl}
              disabled={!addUrl.trim() || addingUrl}
              className="font-mono text-xs uppercase tracking-widest shrink-0"
            >
              {addingUrl ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>

        {/* Generate preview */}
        <div className="space-y-3">
          <Button
            variant="outline"
            onClick={generate}
            disabled={refs.length === 0 || busy}
            className="w-full font-mono text-xs uppercase tracking-widest gap-2"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {generating ? "Generating…" : "Generate Preview"}
          </Button>
          <p className="font-mono text-[10px] text-muted-foreground/50 text-center">
            AI picks the most relevant refs and writes the subject + intro — review before sending
          </p>

          {aiPreview && (
            <div className="space-y-4 border hairline rounded-xl p-4 bg-secondary/40">
              <p className="font-mono text-[10px] uppercase tracking-widest text-primary">AI generated — review before sending</p>
              {aiPreview.subject && (
                <div className="space-y-1.5">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Subject</p>
                  <p className="font-body text-sm text-foreground">{aiPreview.subject}</p>
                  <button
                    onClick={() => { setSubject(aiPreview.subject); setSubjectIsCustom(false); }}
                    className="font-mono text-[10px] uppercase tracking-widest text-primary hover:underline"
                  >
                    Use this subject
                  </button>
                </div>
              )}
              {aiPreview.intro && (
                <div className="space-y-1.5">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Intro paragraph</p>
                  <p className="font-body text-sm text-foreground/80 leading-relaxed">{aiPreview.intro}</p>
                  <button
                    onClick={() => setIntro(aiPreview.intro)}
                    className="font-mono text-[10px] uppercase tracking-widest text-primary hover:underline"
                  >
                    Use this intro
                  </button>
                </div>
              )}
              {intro && (
                <div className="space-y-1.5 pt-1 border-t hairline">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Accepted intro</p>
                  <p className="font-body text-xs text-foreground/60 leading-relaxed">{intro}</p>
                  <button
                    onClick={() => setIntro("")}
                    className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-destructive"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Send buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => send(true)}
            disabled={refs.length === 0 || !subject.trim() || busy}
            className="font-mono text-xs uppercase tracking-widest shrink-0"
          >
            {sendingTest ? "Sending…" : "Send test"}
          </Button>
          <Button
            onClick={() => setConfirming(true)}
            disabled={refs.length === 0 || !subject.trim() || busy}
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
