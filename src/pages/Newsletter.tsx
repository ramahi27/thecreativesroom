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

const SITE_URL = "https://thecreativesroom.com";
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
};

function refUrl(r: Ref): string {
  const slug = r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${SITE_URL}/ref/${r.id}${slug ? `-${slug}` : ""}`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function emailThumbUrl(u: string): string {
  try {
    const host = new URL(u).hostname;
    if (host.includes("ytimg.com") || host.includes("vumbnail.com") || host.includes("vimeocdn.com")) {
      return `https://wsrv.nl/?url=${encodeURIComponent(u)}&w=1240&h=700&fit=cover&output=jpg`;
    }
  } catch {}
  return u;
}

function typeLabel(t: string): string {
  if (t === "video") return "▶ Video";
  if (t === "image") return "◳ Image";
  return "↗ Link";
}

function buildHtml(refs: Ref[], subject: string, intro: string): string {
  const videoCount = refs.filter((r) => r.type === "video").length;
  const imageCount = refs.filter((r) => r.type === "image").length;
  const linkCount = refs.filter((r) => r.type === "link").length;
  const statsParts = [
    videoCount && `${videoCount} video${videoCount === 1 ? "" : "s"}`,
    imageCount && `${imageCount} image${imageCount === 1 ? "" : "s"}`,
    linkCount && `${linkCount} link${linkCount === 1 ? "" : "s"}`,
  ].filter(Boolean).join(" · ");

  const rows = refs.map((r) => {
    const url = refUrl(r);
    const thumb = r.thumbnail_url
      ? `<img src="${emailThumbUrl(r.thumbnail_url)}" alt="${esc(r.title)}" width="620" style="width:100%;max-width:620px;height:auto;display:block;border-radius:12px 12px 0 0;" />`
      : `<div style="width:100%;height:140px;background:linear-gradient(135deg,#1a1a1a,#0f0f0f);border-radius:12px 12px 0 0;"></div>`;

    const credits = [
      r.brand && `<span style="color:#f5f0e8;font-weight:600;">${esc(r.brand)}</span>`,
      r.agency && `<span style="color:#999;">${esc(r.agency)}</span>`,
      r.year && `<span style="color:#666;">${r.year}</span>`,
    ].filter(Boolean).join(' <span style="color:#333;">·</span> ');

    const cats = (r.categories || []).slice(0, 2).map((c) =>
      `<span style="display:inline-block;padding:3px 8px;margin:0 4px 4px 0;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:4px;font-family:monospace;font-size:9px;text-transform:uppercase;letter-spacing:0.12em;color:#a8a8a8;">${esc(c)}</span>`
    ).join("");

    const note = r.notes ? `<p style="margin:10px 0 0 0;font-family:Georgia,serif;font-size:14px;font-style:italic;color:#aaa;line-height:1.5;">${esc(r.notes.slice(0, 160))}${r.notes.length > 160 ? "…" : ""}</p>` : "";

    return `
<tr><td style="padding:0 0 28px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;border-radius:12px;overflow:hidden;border:1px solid #1f1f1f;">
    <tr><td>
      <a href="${url}" style="display:block;text-decoration:none;">${thumb}</a>
    </td></tr>
    <tr><td style="padding:20px 22px 22px 22px;">
      <p style="margin:0 0 10px 0;font-family:monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:#f46a20;">${typeLabel(r.type)}</p>
      <a href="${url}" style="text-decoration:none;">
        <h2 style="margin:0 0 8px 0;font-family:Georgia,serif;font-size:22px;font-weight:700;color:#f5f0e8;line-height:1.25;letter-spacing:-0.01em;">${esc(r.title)}</h2>
      </a>
      ${credits ? `<p style="margin:0 0 12px 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.5;">${credits}</p>` : ""}
      ${cats ? `<div style="margin:0 0 4px 0;">${cats}</div>` : ""}
      ${note}
      <p style="margin:16px 0 0 0;">
        <a href="${url}" style="display:inline-block;font-family:monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:#f46a20;text-decoration:none;">View reference →</a>
      </p>
    </td></tr>
  </table>
</td></tr>`;
  }).join("");

  const introHtml = intro.trim()
    ? `<tr><td style="padding:28px 0 8px 0;">
        <p style="margin:0;font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#cfcfcf;">${esc(intro).replace(/\n/g, "<br>")}</p>
      </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#080808;font-family:Georgia,serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080808;">
    <tr><td align="center" style="padding:48px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;">

        <!-- Brand -->
        <tr><td style="padding:0 0 28px 0;text-align:center;">
          <a href="${SITE_URL}" style="text-decoration:none;">
            <p style="margin:0;font-family:monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.32em;color:#f46a20;">⏵ The Creatives Room</p>
          </a>
        </td></tr>

        <!-- Header -->
        <tr><td style="padding:0 0 24px 0;border-bottom:1px solid #1f1f1f;">
          <p style="margin:0 0 10px 0;font-family:monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.22em;color:#888;">This week in the room</p>
          <h1 style="margin:0;font-family:Georgia,serif;font-size:34px;font-weight:900;color:#f5f0e8;letter-spacing:-0.025em;line-height:1.05;">${esc(subject)}</h1>
          ${statsParts ? `<p style="margin:14px 0 0 0;font-family:monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:#666;">${statsParts}</p>` : ""}
        </td></tr>

        ${introHtml}

        <!-- References -->
        <tr><td style="padding:32px 0 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:8px 0 32px 0;text-align:center;">
          <a href="${SITE_URL}" style="display:inline-block;padding:14px 28px;background:#f46a20;color:#0a0a0a;font-family:monospace;font-size:12px;text-transform:uppercase;letter-spacing:0.18em;font-weight:700;text-decoration:none;border-radius:6px;">Browse the full library →</a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:28px 0 0 0;border-top:1px solid #1f1f1f;text-align:center;">
          <p style="margin:0 0 8px 0;font-family:Georgia,serif;font-size:13px;color:#888;font-style:italic;">A reference library for creatives — curated, not algorithmic.</p>
          <p style="margin:0;font-family:monospace;font-size:10px;color:#444;letter-spacing:0.1em;">
            <a href="${SITE_URL}" style="color:#f46a20;text-decoration:none;">thecreativesroom.com</a>
            <span style="color:#333;"> · </span>
            <a href="${SITE_URL}/settings" style="color:#666;text-decoration:none;">Manage account</a>
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
      .select("id,title,thumbnail_url,source_url,brand,agency,year,categories,tags,notes,type")
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

      const html = buildHtml(refs, subject, intro);
      const preview = `${refs.length} new reference${refs.length === 1 ? "" : "s"} added this week`;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-newsletter`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ subject, preview, html, testEmail: testOnly ? "r.laith27@gmail.com" : undefined }),
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
