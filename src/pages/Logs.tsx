import { useEffect, useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { PageMeta } from "@/components/PageMeta";
import { SiteFooter } from "@/components/SiteFooter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Search, Sparkles, Check, X as XIcon, Link2, Link2Off, ImageOff,
  ArrowUpDown, ArrowUp, ArrowDown, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { rememberModalReturn, setModalNavOrder } from "@/lib/modalReturn";
import { enrichReferenceMetadata } from "@/lib/enrichMetadata";
import { refPath } from "@/lib/slug";

function hasValue(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().length > 0 : false;
}

function hasCompleteMetadata(r: { visual_summary?: string | null }): boolean {
  return hasValue(r.visual_summary);
}

type LogRow = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  brand: string | null;
  agency: string | null;
  type: string;
  year: number | null;
  created_at: string;
  approved_at: string | null;
  created_by: string | null;
  approved_by: string | null;
  created_by_email: string | null;
  approved_by_email: string | null;
  editing_style?: string | null;
  visual_summary?: string | null;
  has_ai_metadata?: boolean;
  link_status?: string | null;
  link_checked_at?: string | null;
  audited_at?: string | null;
};

type SortCol = "added" | "approved" | "title";
type SortDir = "asc" | "desc";

type AuditChange = { field: string; from: unknown; to: unknown };
type AuditEntry =
  | { kind: "fix"; title: string; changes: AuditChange[]; reason: string | null }
  | { kind: "warn"; message: string };

const formatDate = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Compact toggle-button chip group
function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest border hairline transition-colors ${
            value === o.value
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/40"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const Logs = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Filters
  const [typeFilter, setTypeFilter] = useState<"all" | "video" | "image">("all");
  const [linkFilter, setLinkFilter] = useState<"all" | "ok" | "dead" | "error" | "unchecked">("all");
  const [aiFilter, setAiFilter] = useState<"all" | "complete" | "missing">("all");
  const [thumbFilter, setThumbFilter] = useState<"all" | "has" | "missing">("all");

  // Sort
  const [sortCol, setSortCol] = useState<SortCol>("added");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Backfill / audit
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<string>("");
  const [auditing, setAuditing] = useState(false);
  const [auditingId, setAuditingId] = useState<string | null>(null);
  const [auditProgress, setAuditProgress] = useState<string>("");
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  // Link health
  const [linkChecking, setLinkChecking] = useState(false);
  const [linkResults, setLinkResults] = useState<{ checked: number; ok: number; dead: number; errored: number; message: string } | null>(null);
  const [deadLinks, setDeadLinks] = useState<Array<{ id: string; title: string; source_url: string | null; link_status: string; link_checked_at: string }>>([])
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [draftUrl, setDraftUrl] = useState("");
  const [deletingDead, setDeletingDead] = useState(false);

  // Reports
  type Report = {
    id: string;
    reference_id: string;
    field: string;
    message: string;
    resolved: boolean;
    created_at: string;
    ref_title?: string;
  };
  const [reports, setReports] = useState<Report[]>([]);

  // ── Derived counts for stat cards ──────────────────────────────────────────────
  const countDeadLinks = useMemo(() => rows.filter((r) => r.link_status === "dead").length, [rows]);
  const countMissingAI = useMemo(() => rows.filter((r) => !r.has_ai_metadata).length, [rows]);
  const countNoThumb = useMemo(() => rows.filter((r) => !r.thumbnail_url).length, [rows]);

  // ── Sort handler ─────────────────────────────────────────────────────────────
  function handleSort(col: SortCol) {
    if (col === sortCol) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (col !== sortCol) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 text-primary" />
      : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
  }

  // ── Filtered + sorted rows ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = rows;
    if (typeFilter !== "all") result = result.filter((r) => r.type === typeFilter);
    if (linkFilter === "unchecked") result = result.filter((r) => !r.link_status);
    else if (linkFilter !== "all") result = result.filter((r) => r.link_status === linkFilter);
    if (aiFilter === "complete") result = result.filter((r) => r.has_ai_metadata);
    else if (aiFilter === "missing") result = result.filter((r) => !r.has_ai_metadata);
    if (thumbFilter === "has") result = result.filter((r) => !!r.thumbnail_url);
    else if (thumbFilter === "missing") result = result.filter((r) => !r.thumbnail_url);
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((r) =>
        [r.title, r.brand, r.created_by_email, r.approved_by_email]
          .filter(Boolean).join(" ").toLowerCase().includes(q),
      );
    }
    return [...result].sort((a, b) => {
      let aVal: string, bVal: string;
      if (sortCol === "title") { aVal = a.title.toLowerCase(); bVal = b.title.toLowerCase(); }
      else if (sortCol === "approved") { aVal = a.approved_at ?? ""; bVal = b.approved_at ?? ""; }
      else { aVal = a.created_at; bVal = b.created_at; }
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, typeFilter, linkFilter, aiFilter, thumbFilter, search, sortCol, sortDir]);

  // ── Data loading ──────────────────────────────────────────────────────────────
  async function loadDeadLinks() {
    const { data } = await supabase
      .from("references")
      .select("id,title,source_url,link_status,link_checked_at")
      .eq("link_status", "dead")
      .order("link_checked_at", { ascending: false })
      .limit(100);
    setDeadLinks((data as any) || []);
  }

  async function loadReports() {
    const { data } = await supabase
      .from("reference_reports")
      .select("id,reference_id,field,message,resolved,created_at,references(title)")
      .eq("resolved", false)
      .order("created_at", { ascending: false });
    setReports(((data as any[]) || []).map((r) => ({ ...r, ref_title: r.references?.title ?? r.reference_id })));
  }

  useEffect(() => { document.title = "Admin · Logs — The Creatives Room"; }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadReports();
    loadDeadLinks();
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_reference_logs");
      if (error) { console.error(error); setRows([]); setLoading(false); return; }
      const baseRows = (data as LogRow[]) || [];
      const ids = baseRows.map((r) => r.id);
      const infoMap = new Map<string, {
        brand: string | null; agency: string | null; year: number | null;
        editing_style: string | null; visual_summary: string | null;
        link_status: string | null; link_checked_at: string | null;
        audited_at: string | null;
      }>();
      const CHUNK = 150;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data: extra } = await supabase
          .from("references")
          .select("id,brand,agency,year,editing_style,visual_summary,link_status,link_checked_at,audited_at")
          .in("id", slice);
        (extra || []).forEach((t: any) =>
          infoMap.set(t.id, {
            brand: t.brand ?? null, agency: t.agency ?? null, year: t.year ?? null,
            editing_style: t.editing_style ?? null, visual_summary: t.visual_summary ?? null,
            link_status: t.link_status ?? null, link_checked_at: t.link_checked_at ?? null,
            audited_at: t.audited_at ?? null,
          }),
        );
      }
      setRows(
        baseRows.map((r) => {
          const info = infoMap.get(r.id);
          const merged = {
            ...r,
            brand: info?.brand ?? r.brand ?? null,
            agency: info?.agency ?? r.agency ?? null,
            year: info?.year ?? r.year ?? null,
            editing_style: info?.editing_style ?? null,
            visual_summary: info?.visual_summary ?? null,
            link_status: info?.link_status ?? null,
            link_checked_at: info?.link_checked_at ?? null,
            audited_at: info?.audited_at ?? null,
          };
          return { ...merged, has_ai_metadata: hasCompleteMetadata(merged) } as LogRow;
        }),
      );
      setLoading(false);
    })();
  }, [isAdmin]);

  // ── Link health ──────────────────────────────────────────────────────────────
  async function handleCheckLinks() {
    setLinkChecking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-links`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Link check failed");
      setLinkResults(json);
      toast.success(json.message);
      await loadDeadLinks();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLinkChecking(false);
    }
  }

  async function deleteDeadLink(id: string) {
    const { error } = await supabase.from("references").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setDeadLinks((prev) => prev.filter((r) => r.id !== id));
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function deleteAllDeadLinks() {
    if (deadLinks.length === 0) return;
    if (!confirm(`Permanently delete all ${deadLinks.length} broken-link reference(s)? This cannot be undone.`)) return;
    setDeletingDead(true);
    const ids = deadLinks.map((r) => r.id);
    const { error } = await supabase.from("references").delete().in("id", ids);
    setDeletingDead(false);
    if (error) { toast.error(error.message); return; }
    setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
    setDeadLinks([]);
    toast.success(`Deleted ${ids.length} broken-link reference${ids.length === 1 ? "" : "s"}`);
  }

  async function saveLinkUrl(id: string) {
    const url = draftUrl.trim();
    if (!url) { setEditingLinkId(null); return; }
    const { error } = await supabase
      .from("references")
      .update({ source_url: url, link_status: null, link_checked_at: null })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    setDeadLinks((prev) => prev.filter((r) => r.id !== id));
    setEditingLinkId(null);
    toast.success("URL updated — run Check all links to verify");
  }

  // ── Audit recent ────────────────────────────────────────────────────────────
  async function handleAuditRecent() {
    if (!confirm("Audit entries added in the last 3 days and auto-fix mistakes in title, brand, agency and year?")) return;
    setAuditing(true);
    setAuditProgress("Starting…");
    setAuditLog([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-recent`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ days: 3 }),
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Audit failed (HTTP ${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let fixed = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let msg: any;
          try { msg = JSON.parse(line); } catch { continue; }
          if (msg.type === "progress") { setAuditProgress(msg.message); }
          else if (msg.type === "fix") {
            fixed++;
            setAuditProgress(`Fixed "${msg.title}"`);
            setAuditLog((prev) => [{ kind: "fix", title: msg.title, changes: msg.changes ?? [], reason: msg.reason ?? null } as AuditEntry, ...prev].slice(0, 50));
          }
          else if (msg.type === "warn") { setAuditLog((prev) => [{ kind: "warn", message: msg.message } as AuditEntry, ...prev].slice(0, 50)); }
          else if (msg.type === "error") { throw new Error(msg.message); }
          else if (msg.type === "done") {
            setAuditProgress(msg.message);
            if (msg.fixed > 0) toast.success(msg.message); else toast.info(msg.message);
          }
        }
      }
      if (fixed > 0) {
        const { data } = await supabase.rpc("get_reference_logs");
        if (data) {
          setRows((prev) => {
            const byId = new Map((data as LogRow[]).map((r) => [r.id, r]));
            return prev.map((r) => { const fresh = byId.get(r.id); return fresh ? { ...r, title: fresh.title, brand: fresh.brand, agency: fresh.agency, year: fresh.year } : r; });
          });
        }
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAuditing(false);
    }
  }

  // ── Audit single reference ───────────────────────────────────────────────
  async function handleAuditOne(id: string, title: string) {
    if (auditingId) return;
    setAuditingId(id);
    setAuditLog([]);
    setAuditProgress(`Auditing "${title}"…`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-recent`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Audit failed (HTTP ${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let fixed = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let msg: any;
          try { msg = JSON.parse(line); } catch { continue; }
          if (msg.type === "progress") { setAuditProgress(msg.message); }
          else if (msg.type === "fix") {
            fixed++;
            setAuditLog((prev) => [{ kind: "fix", title: msg.title, changes: msg.changes ?? [], reason: msg.reason ?? null } as AuditEntry, ...prev].slice(0, 50));
          } else if (msg.type === "warn") {
            setAuditLog((prev) => [{ kind: "warn", message: msg.message } as AuditEntry, ...prev].slice(0, 50));
          } else if (msg.type === "error") {
            throw new Error(msg.message);
          } else if (msg.type === "done") {
            setAuditProgress(msg.message);
            if (msg.fixed > 0) toast.success(`"${title}": ${msg.fixed} field(s) corrected`);
            else toast.info(`"${title}": no changes needed`);
          }
        }
      }
      if (fixed > 0) {
        const { data: fresh } = await supabase
          .from("references")
          .select("id,title,brand,agency,year")
          .eq("id", id)
          .maybeSingle();
        if (fresh) {
          setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...(fresh as any) } : r));
        }
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAuditingId(null);
    }
  }

  // ── Backfill ──────────────────────────────────────────────────────────────
  async function handleBackfillAll() {
    const pending = rows.filter((r) => !r.has_ai_metadata);
    if (pending.length === 0) { toast.info("All references already have complete metadata."); return; }
    if (!confirm(`Generate AI metadata for ${pending.length} reference(s) with missing fields?`)) return;
    setBackfilling(true);
    let ok = 0, failed = 0;
    for (let i = 0; i < pending.length; i++) {
      const r = pending[i];
      setBackfillProgress(`${i + 1}/${pending.length} · ${r.title}`);
      try {
        await enrichReferenceMetadata(r.id);
        let fresh = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt > 0) await new Promise((res) => setTimeout(res, 3000));
          const { data, error: freshError } = await supabase
            .from("references").select("brand,agency,year,editing_style,visual_summary").eq("id", r.id).maybeSingle();
          if (freshError) throw freshError;
          fresh = data;
          if (hasCompleteMetadata({ visual_summary: (fresh as any)?.visual_summary ?? null })) break;
          if (attempt === 0) await enrichReferenceMetadata(r.id);
        }
        const complete = hasCompleteMetadata({ visual_summary: (fresh as any)?.visual_summary ?? null });
        setRows((prev) =>
          prev.map((x) =>
            x.id === r.id
              ? { ...x, brand: fresh?.brand ?? x.brand, agency: fresh?.agency ?? x.agency, year: fresh?.year ?? x.year,
                  editing_style: (fresh as any)?.editing_style ?? x.editing_style,
                  visual_summary: (fresh as any)?.visual_summary ?? x.visual_summary,
                  has_ai_metadata: complete }
              : x,
          ),
        );
        if (complete) ok++; else failed++;
      } catch (error: any) {
        console.error("Backfill failed", r.id, error);
        failed++;
      }
      await new Promise((res) => setTimeout(res, 1200));
    }
    setBackfilling(false);
    setBackfillProgress("");
    toast.success(`Backfill done · ${ok} updated, ${failed} incomplete`);
  }

  // ── Reports ──────────────────────────────────────────────────────────────
  async function resolveReport(id: string) {
    const { error } = await supabase.from("reference_reports").update({ resolved: true }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setReports((prev) => prev.filter((r) => r.id !== id));
    toast.success("Report resolved");
  }

  // ── Guard ──────────────────────────────────────────────────────────────
  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen grain">
      <PageMeta title="Admin · Logs — The Creatives Room" description="Reference approval logs." noindex />
      <SiteHeader />

      {/* Page header */}
      <section className="border-b hairline">
        <div className="container py-10 md:py-14">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-3">⏵ ADMIN</p>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight mb-2">Logs</h1>
          <p className="text-sm text-muted-foreground font-mono">
            All published references — filter, sort, and manage health checks.
          </p>
        </div>
      </section>

      {/* Admin actions bar — always visible above tabs */}
      <section className="border-b hairline bg-background/80 backdrop-blur-xl">
        <div className="container py-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={handleBackfillAll}
            disabled={backfilling || countMissingAI === 0}
            variant="outline"
            className="font-mono text-[11px] uppercase tracking-widest h-9"
          >
            <Sparkles className="h-3.5 w-3.5 mr-2" />
            {backfilling ? backfillProgress || "Generating…" : `Backfill missing (${countMissingAI})`}
          </Button>
          <Button
            type="button"
            onClick={handleAuditRecent}
            disabled={auditing}
            variant="outline"
            className="font-mono text-[11px] uppercase tracking-widest h-9"
            title="Fact-check the last 3 days of entries and auto-fix wrong title / brand / agency / year"
          >
            <Sparkles className="h-3.5 w-3.5 mr-2" />
            {auditing ? auditProgress || "Auditing…" : "Audit recent (3d)"}
          </Button>
        </div>
        {(auditing || auditingId !== null || auditLog.length > 0) && (
          <div className="container pb-3">
            <div className="border hairline bg-secondary/40 max-h-72 overflow-auto p-3 font-mono text-[11px] leading-relaxed space-y-1.5">
              {(auditing || auditingId !== null) && (
                <p className="text-primary sticky top-0 bg-secondary/90 backdrop-blur-sm -mx-3 px-3 py-1 mb-1 z-10">
                  {auditProgress}
                </p>
              )}
              {auditLog.length === 0 && (auditing || auditingId !== null) ? (
                <p className="text-muted-foreground">Checking entries…</p>
              ) : (
                auditLog.map((e, i) =>
                  e.kind === "warn" ? (
                    <p key={i} className="text-yellow-600/80 py-0.5">⚠ {e.message}</p>
                  ) : (
                    <div key={i} className="border hairline bg-background/40 p-2.5">
                      <p className="font-semibold text-foreground mb-1.5 truncate">{e.title}</p>
                      <div className="space-y-1">
                        {e.changes.map((c, j) => (
                          <div key={j} className="flex items-baseline gap-2">
                            <span className="w-14 shrink-0 uppercase tracking-widest text-muted-foreground text-[9px]">
                              {c.field}
                            </span>
                            <span className="line-through text-muted-foreground/60 truncate max-w-[38%]">
                              {c.from == null || c.from === "" ? "(empty)" : String(c.from)}
                            </span>
                            <span className="text-muted-foreground shrink-0">→</span>
                            <span className={`truncate ${c.to == null ? "italic text-muted-foreground" : "text-foreground"}`}>
                              {c.to == null ? "(cleared)" : String(c.to)}
                            </span>
                          </div>
                        ))}
                      </div>
                      {e.reason && (
                        <p className="text-[10px] italic text-muted-foreground/70 mt-1.5">{e.reason}</p>
                      )}
                    </div>
                  ),
                )
              )}
            </div>
          </div>
        )}
      </section>

      {/* Tabbed content */}
      <div className="container py-8">
        <Tabs defaultValue="entries">
          <TabsList className="mb-8 font-mono text-[11px] uppercase tracking-widest">
            <TabsTrigger value="entries">Entries ({rows.length})</TabsTrigger>
            <TabsTrigger value="health">
              Link health{deadLinks.length > 0 ? ` · ${deadLinks.length} dead` : ""}
            </TabsTrigger>
            <TabsTrigger value="reports">
              Reports{reports.length > 0 ? ` · ${reports.length}` : ""}
            </TabsTrigger>
          </TabsList>

          {/* ── ENTRIES TAB ──────────────────────────────────────────────── */}
          <TabsContent value="entries" className="space-y-6">

            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: "Total entries",
                  value: rows.length,
                  active: typeFilter === "all" && linkFilter === "all" && aiFilter === "all" && thumbFilter === "all",
                  onClick: () => { setTypeFilter("all"); setLinkFilter("all"); setAiFilter("all"); setThumbFilter("all"); setSearch(""); },
                  warn: false,
                },
                {
                  label: "Dead links",
                  value: countDeadLinks,
                  active: linkFilter === "dead",
                  onClick: () => setLinkFilter(linkFilter === "dead" ? "all" : "dead"),
                  warn: countDeadLinks > 0,
                },
                {
                  label: "Missing AI",
                  value: countMissingAI,
                  active: aiFilter === "missing",
                  onClick: () => setAiFilter(aiFilter === "missing" ? "all" : "missing"),
                  warn: countMissingAI > 0,
                },
                {
                  label: "No thumbnail",
                  value: countNoThumb,
                  active: thumbFilter === "missing",
                  onClick: () => setThumbFilter(thumbFilter === "missing" ? "all" : "missing"),
                  warn: countNoThumb > 0,
                },
              ].map((card) => (
                <button
                  key={card.label}
                  onClick={card.onClick}
                  className={`text-left p-4 border hairline transition-colors hover:bg-secondary/60 ${
                    card.active ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <div className={`text-2xl font-light tabular-nums mb-1 ${card.warn && !card.active ? "text-destructive" : ""}`}>
                    {card.value}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {card.label}
                  </div>
                </button>
              ))}
            </div>

            {/* Filter chips + search */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Chips
                  options={[
                    { label: "All types", value: "all" as const },
                    { label: "Video", value: "video" as const },
                    { label: "Image", value: "image" as const },
                  ]}
                  value={typeFilter}
                  onChange={(v) => setTypeFilter(v as typeof typeFilter)}
                />
                <Chips
                  options={[
                    { label: "All links", value: "all" as const },
                    { label: "OK", value: "ok" as const },
                    { label: "Dead", value: "dead" as const },
                    { label: "Unchecked", value: "unchecked" as const },
                  ]}
                  value={linkFilter}
                  onChange={(v) => setLinkFilter(v as typeof linkFilter)}
                />
                <Chips
                  options={[
                    { label: "All AI", value: "all" as const },
                    { label: "Complete", value: "complete" as const },
                    { label: "Missing", value: "missing" as const },
                  ]}
                  value={aiFilter}
                  onChange={(v) => setAiFilter(v as typeof aiFilter)}
                />
                <Chips
                  options={[
                    { label: "All thumbs", value: "all" as const },
                    { label: "Has", value: "has" as const },
                    { label: "Missing", value: "missing" as const },
                  ]}
                  value={thumbFilter}
                  onChange={(v) => setThumbFilter(v as typeof thumbFilter)}
                />
              </div>
              <div className="flex items-center gap-4">
                <div className="relative max-w-sm flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search title, brand, email…"
                    className="pl-9 bg-secondary border-0 font-mono text-xs"
                  />
                </div>
                {filtered.length !== rows.length && (
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {filtered.length} of {rows.length}
                  </span>
                )}
              </div>
            </div>

            {/* Main table */}
            {loading ? (
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">No entries match.</p>
            ) : (
              <div className="border hairline">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest w-10">#</TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest">
                        <button onClick={() => handleSort("title")} className="flex items-center hover:text-foreground transition-colors">
                          Reference <SortIcon col="title" />
                        </button>
                      </TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest">Checks</TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest">Added by</TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest">Approved by</TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest">
                        <button onClick={() => handleSort("approved")} className="flex items-center hover:text-foreground transition-colors">
                          Approved <SortIcon col="approved" />
                        </button>
                      </TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest">
                        <button onClick={() => handleSort("added")} className="flex items-center hover:text-foreground transition-colors">
                          Added <SortIcon col="added" />
                        </button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r, i) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <Link
                            to={refPath(r.id, r.title)}
                            onClick={() => { rememberModalReturn(); setModalNavOrder(filtered.map((x) => x.id)); }}
                            className="flex items-center gap-3 hover:opacity-80"
                          >
                            {r.thumbnail_url ? (
                              <img src={r.thumbnail_url} alt="" className="h-10 w-16 object-cover border hairline shrink-0" loading="lazy" />
                            ) : (
                              <div className="h-10 w-16 bg-muted border hairline shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="text-sm truncate max-w-[280px]">{r.title}</div>
                              <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground truncate max-w-[280px]">
                                {[r.brand, r.year, r.type].filter(Boolean).join(" · ")}
                              </div>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span
                              title={r.has_ai_metadata ? "AI metadata complete" : "Missing AI metadata"}
                              className={`inline-flex h-5 w-5 items-center justify-center border hairline ${r.has_ai_metadata ? "bg-primary/10 text-primary" : "text-muted-foreground/40"}`}
                            >
                              <Sparkles className="h-3 w-3" strokeWidth={r.has_ai_metadata ? 2 : 1.5} />
                            </span>
                            <span
                              title={
                                r.link_status === "ok" ? `Link OK · ${formatDate(r.link_checked_at ?? null)}` :
                                r.link_status === "dead" ? `Dead link · ${formatDate(r.link_checked_at ?? null)}` :
                                r.link_status === "error" ? `Link error · ${formatDate(r.link_checked_at ?? null)}` :
                                "Link not yet checked"
                              }
                              className={`inline-flex h-5 w-5 items-center justify-center border hairline ${
                                r.link_status === "ok" ? "bg-primary/10 text-primary" :
                                r.link_status === "dead" ? "bg-destructive/15 text-destructive" :
                                r.link_status === "error" ? "bg-yellow-500/10 text-yellow-500" :
                                "text-muted-foreground/40"
                              }`}
                            >
                              {r.link_status === "dead"
                                ? <Link2Off className="h-3 w-3" strokeWidth={2} />
                                : <Link2 className="h-3 w-3" strokeWidth={r.link_status === "ok" ? 2 : 1} />}
                            </span>
                            <span
                              title={r.thumbnail_url ? "Has thumbnail" : "No thumbnail"}
                              className={`inline-flex h-5 w-5 items-center justify-center border hairline ${r.thumbnail_url ? "bg-primary/10 text-primary" : "text-muted-foreground/40"}`}
                            >
                              {r.thumbnail_url
                                ? <Check className="h-3 w-3" strokeWidth={2.5} />
                                : <ImageOff className="h-3 w-3" strokeWidth={1.5} />}
                            </span>
                            <span className="w-px h-3.5 bg-border mx-0.5 shrink-0" />
                            <button
                              onClick={() => handleAuditOne(r.id, r.title)}
                              disabled={!!auditingId}
                              title={
                                auditingId === r.id ? "Auditing…" :
                                r.audited_at ? `Audited · ${formatDate(r.audited_at)} — click to re-audit` :
                                "Not yet audited — click to audit with AI"
                              }
                              className={`inline-flex h-5 w-5 items-center justify-center border transition-colors ${
                                auditingId === r.id
                                  ? "border-primary text-primary animate-pulse"
                                  : r.audited_at
                                    ? "bg-primary/10 border-primary/40 text-primary hover:bg-primary/20"
                                    : "border-dashed border-muted-foreground/30 text-muted-foreground/50 hover:border-primary/60 hover:text-primary"
                              }`}
                            >
                              <Wand2 className="h-3 w-3" strokeWidth={r.audited_at ? 2 : 1.5} />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.created_by_email || (r.created_by ? "—" : "system")}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.approved_by_email || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{formatDate(r.approved_at)}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ── LINK HEALTH TAB ──────────────────────────────────────────── */}
          <TabsContent value="health" className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              {deadLinks.length > 0 && (
                <Button
                  type="button"
                  onClick={deleteAllDeadLinks}
                  disabled={deletingDead}
                  variant="outline"
                  className="font-mono text-[11px] uppercase tracking-widest h-9 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                >
                  <XIcon className="h-3.5 w-3.5 mr-2" strokeWidth={1.8} />
                  {deletingDead ? "Deleting…" : `Delete all (${deadLinks.length})`}
                </Button>
              )}
              <Button
                type="button"
                onClick={handleCheckLinks}
                disabled={linkChecking}
                variant="outline"
                className="font-mono text-[11px] uppercase tracking-widest h-9"
              >
                <Link2 className="h-3.5 w-3.5 mr-2" strokeWidth={1.8} />
                {linkChecking ? "Checking…" : "Check all links"}
              </Button>
            </div>
            {linkResults && (
              <p className="font-mono text-xs text-muted-foreground">{linkResults.message}</p>
            )}
            {deadLinks.length > 0 ? (
              <div className="border hairline">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest">Reference</TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest">URL</TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest">Checked at</TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deadLinks.map((ref) => (
                      <TableRow key={ref.id}>
                        <TableCell>
                          <Link to={refPath(ref.id, ref.title)} className="flex items-center gap-2 hover:opacity-80">
                            <Link2Off className="h-3.5 w-3.5 text-destructive shrink-0" strokeWidth={1.8} />
                            <span className="font-mono text-xs truncate max-w-[260px]">{ref.title}</span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          {editingLinkId === ref.id ? (
                            <input
                              autoFocus
                              type="url"
                              value={draftUrl}
                              onChange={(e) => setDraftUrl(e.target.value)}
                              onBlur={() => saveLinkUrl(ref.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); saveLinkUrl(ref.id); }
                                if (e.key === "Escape") setEditingLinkId(null);
                              }}
                              className="w-full bg-transparent border-b border-primary font-mono text-xs focus:outline-none text-foreground"
                            />
                          ) : ref.source_url ? (
                            <span
                              onClick={() => { setDraftUrl(ref.source_url ?? ""); setEditingLinkId(ref.id); }}
                              className="font-mono text-xs text-muted-foreground hover:text-foreground truncate max-w-[300px] flex items-center gap-1 cursor-text group"
                              title="Click to edit URL"
                            >
                              <span className="truncate">{ref.source_url}</span>
                              <span className="opacity-0 group-hover:opacity-60 text-[10px] shrink-0">✎</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => { setDraftUrl(""); setEditingLinkId(ref.id); }}
                              className="font-mono text-xs text-muted-foreground/50 hover:text-muted-foreground italic"
                            >
                              + add URL
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {formatDate(ref.link_checked_at)}
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => deleteDeadLink(ref.id)}
                            title="Delete this reference"
                            className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground/50 hover:text-destructive transition-colors"
                          >
                            <XIcon className="h-3.5 w-3.5" strokeWidth={1.8} />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="font-mono text-xs text-muted-foreground">
                No dead links detected. Run a check to scan all references.
              </p>
            )}
          </TabsContent>

          {/* ── REPORTS TAB ──────────────────────────────────────────── */}
          <TabsContent value="reports">
            {reports.length === 0 ? (
              <p className="font-mono text-xs text-muted-foreground">No pending reports.</p>
            ) : (
              <div className="border hairline divide-y">
                {reports.map((rep) => (
                  <div key={rep.id} className="flex items-start gap-4 p-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground mb-0.5">
                        {rep.field} · <Link to={refPath(rep.reference_id, rep.ref_title ?? "")} className="hover:text-foreground transition-colors">{rep.ref_title}</Link>
                      </p>
                      <p className="font-body text-sm">{rep.message}</p>
                      <p className="font-mono text-[9px] text-muted-foreground mt-1">{new Date(rep.created_at).toLocaleString()}</p>
                    </div>
                    <button
                      onClick={() => resolveReport(rep.id)}
                      className="shrink-0 font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border hairline hover:bg-secondary transition-colors"
                    >
                      Resolve
                    </button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <SiteFooter />
    </div>
  );
};

export default Logs;
