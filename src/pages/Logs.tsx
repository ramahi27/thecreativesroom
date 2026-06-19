import { Fragment, useEffect, useMemo, useState } from "react";
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
  ArrowUpDown, ArrowUp, ArrowDown, Wand2, Eye, EyeOff, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rememberModalReturn, setModalNavOrder } from "@/lib/modalReturn";
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
  visual_enriched_at?: string | null;
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

type EnrichEntry =
  | { kind: "fix"; title: string; strength: string; visualSummary: string | null }
  | { kind: "skip"; title: string }
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
          className={`px-3 py-1.5 font-mono text-xs uppercase tracking-widest border hairline transition-colors ${
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
  const [visualFilter, setVisualFilter] = useState<"all" | "enriched" | "missing">("all");

  // Sort
  const [sortCol, setSortCol] = useState<SortCol>("added");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Process-new (merged backfill + audit)
  const [processing, setProcessing] = useState(false);
  const [redoDays, setRedoDays] = useState<1 | 3 | 7>(3);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processProgress, setProcessProgress] = useState<string>("");
  const [processLog, setProcessLog] = useState<AuditEntry[]>([]);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<string>("");
  const [enrichLog, setEnrichLog] = useState<EnrichEntry[]>([]);
  const [enrichStats, setEnrichStats] = useState<{ checked: number; fixed: number; total: number } | null>(null);
  const [expandedVisualId, setExpandedVisualId] = useState<string | null>(null);

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
  const countNotEnriched = useMemo(() => rows.filter((r) => !r.visual_enriched_at).length, [rows]);
  const countPendingProcess = useMemo(() => {
    const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    return rows.filter((r) => !r.has_ai_metadata || (!r.audited_at && r.created_at > cutoff)).length;
  }, [rows]);
  const countRedoWindow = useMemo(() => {
    const cutoff = new Date(Date.now() - redoDays * 24 * 60 * 60 * 1000).toISOString();
    return rows.filter((r) => r.created_at > cutoff).length;
  }, [rows, redoDays]);

  // ── Sort handler ──────────────────────────────────────────────────────────────────────────────────────
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

  // ── Filtered + sorted rows ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = rows;
    if (typeFilter !== "all") result = result.filter((r) => r.type === typeFilter);
    if (linkFilter === "unchecked") result = result.filter((r) => !r.link_status);
    else if (linkFilter !== "all") result = result.filter((r) => r.link_status === linkFilter);
    if (aiFilter === "complete") result = result.filter((r) => r.has_ai_metadata);
    else if (aiFilter === "missing") result = result.filter((r) => !r.has_ai_metadata);
    if (visualFilter === "enriched") result = result.filter((r) => !!r.visual_enriched_at);
    else if (visualFilter === "missing") result = result.filter((r) => !r.visual_enriched_at);
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
  }, [rows, typeFilter, linkFilter, aiFilter, visualFilter, search, sortCol, sortDir]);

  // ── Data loading ──────────────────────────────────────────────────────────────────────────────────────────
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
        visual_enriched_at: string | null;
        link_status: string | null; link_checked_at: string | null;
        audited_at: string | null;
      }>();
      const CHUNK = 150;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data: extra } = await supabase
          .from("references")
          .select("id,brand,agency,year,editing_style,visual_summary,visual_enriched_at,link_status,link_checked_at,audited_at")
          .in("id", slice);
        (extra || []).forEach((t: any) =>
          infoMap.set(t.id, {
            brand: t.brand ?? null, agency: t.agency ?? null, year: t.year ?? null,
            editing_style: t.editing_style ?? null, visual_summary: t.visual_summary ?? null,
            visual_enriched_at: t.visual_enriched_at ?? null,
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
            visual_enriched_at: info?.visual_enriched_at ?? null,
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

  // ── Link health ──────────────────────────────────────────────────────────────────────────────────────────
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

  // ── Shared NDJSON stream reader for process-new ──────────────────────────────
  async function streamProcessNew(res: Response, onFixed?: () => void) {
    const reader = res.body!.getReader();
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
        if (msg.type === "progress") { setProcessProgress(msg.message); }
        else if (msg.type === "fix") {
          fixed++;
          setProcessProgress(`Updated "${msg.title}"`);
          setProcessLog((prev) => [{ kind: "fix", title: msg.title, changes: msg.changes ?? [], reason: msg.reason ?? null } as AuditEntry, ...prev].slice(0, 50));
        }
        else if (msg.type === "warn") { setProcessLog((prev) => [{ kind: "warn", message: msg.message } as AuditEntry, ...prev].slice(0, 50)); }
        else if (msg.type === "error") { throw new Error(msg.message); }
        else if (msg.type === "done") {
          setProcessProgress(msg.message);
          if (msg.fixed > 0) toast.success(msg.message); else toast.info(msg.message);
          if (msg.fixed > 0) onFixed?.();
        }
      }
    }
    return fixed;
  }

  // ── Process new (bulk) ────────────────────────────────────────────────────────
  async function handleProcessNew(opts?: { redo?: boolean; days?: 1 | 3 | 7 }) {
    if (processing) return;
    const redo = opts?.redo === true;
    const days = opts?.days ?? 3;
    setProcessing(true);
    setProcessProgress("Starting…");
    setProcessLog([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let offset = 0;
      while (true) {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-new`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ offset, days, redo }),
        });
        if (!res.ok || !res.body) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `Process failed (HTTP ${res.status})`);
        }
        let batchDone: any = null;
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
            if (msg.type === "progress") { setProcessProgress(msg.message); }
            else if (msg.type === "fix") {
              fixed++;
              setProcessProgress(`Updated "${msg.title}"`);
              setProcessLog((prev) => [{ kind: "fix", title: msg.title, changes: msg.changes ?? [], reason: msg.reason ?? null } as AuditEntry, ...prev].slice(0, 50));
            }
            else if (msg.type === "warn") { setProcessLog((prev) => [{ kind: "warn", message: msg.message } as AuditEntry, ...prev].slice(0, 50)); }
            else if (msg.type === "error") { throw new Error(msg.message); }
            else if (msg.type === "done") { batchDone = msg; setProcessProgress(msg.message); }
          }
        }
        if (!batchDone || !batchDone.hasMore) break;
        offset = batchDone.nextOffset ?? offset;
      }
      const { data } = await supabase.rpc("get_reference_logs");
      if (data) {
        const byId = new Map((data as LogRow[]).map((r) => [r.id, r]));
        setRows((prev) => prev.map((r) => {
          const fresh = byId.get(r.id);
          if (!fresh) return r;
          const merged = { ...r, title: fresh.title, brand: fresh.brand, agency: fresh.agency, year: fresh.year, audited_at: (fresh as any).audited_at ?? r.audited_at };
          return { ...merged, has_ai_metadata: hasCompleteMetadata(merged) };
        }));
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  }

  // ── Process single reference (per-row wand) ───────────────────────────────────
  async function handleProcessOne(id: string, title: string) {
    if (processingId) return;
    setProcessingId(id);
    setProcessLog([]);
    setProcessProgress(`Processing "${title}"…`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-new`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Process failed (HTTP ${res.status})`);
      }
      let fixed = 0;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
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
          if (msg.type === "progress") { setProcessProgress(msg.message); }
          else if (msg.type === "fix") {
            fixed++;
            setProcessLog((prev) => [{ kind: "fix", title: msg.title, changes: msg.changes ?? [], reason: msg.reason ?? null } as AuditEntry, ...prev].slice(0, 50));
          }
          else if (msg.type === "warn") { setProcessLog((prev) => [{ kind: "warn", message: msg.message } as AuditEntry, ...prev].slice(0, 50)); }
          else if (msg.type === "error") { throw new Error(msg.message); }
          else if (msg.type === "done") {
            setProcessProgress(msg.message);
            if (fixed > 0) toast.success(`"${title}": updated`); else toast.info(`"${title}": no changes needed`);
          }
        }
      }
      if (fixed > 0) {
        const { data: fresh } = await supabase
          .from("references")
          .select("id,title,brand,agency,year,visual_summary,editing_style,audited_at")
          .eq("id", id).maybeSingle();
        if (fresh) {
          setRows((prev) => prev.map((r) => {
            if (r.id !== id) return r;
            const merged = { ...r, ...(fresh as any) };
            return { ...merged, has_ai_metadata: hasCompleteMetadata(merged) };
          }));
        }
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessingId(null);
    }
  }

  // ── Enrich visual (web-grounded) ─────────────────────────────────────────────────────────────────────────
  async function handleEnrichVisual(force = false) {
    if (enriching) return;
    if (force && !confirm("Re-enrich ALL entries (overwrite existing visual_summary / editing_style)?")) return;
    setEnriching(true);
    setEnrichProgress("Starting…");
    setEnrichLog([]);
    setEnrichStats(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let offset = 0;
      // Loop through batches until done
      while (true) {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enrich-visual`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ offset, limit: 50, force }),
        });
        if (!res.ok || !res.body) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `Enrich failed (HTTP ${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let batchDone: any = null;
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
            if (msg.type === "progress") {
              setEnrichProgress(msg.message);
            } else if (msg.type === "fix") {
              setEnrichProgress(msg.message);
              const vs = msg.changes?.find((c: any) => c.field === "visual_summary")?.to ?? null;
              setEnrichLog(prev => [...prev, { kind: "fix", title: msg.title ?? "?", strength: msg.strength ?? "none", visualSummary: vs } as EnrichEntry].slice(-100));
            } else if (msg.type === "skip") {
              setEnrichProgress(msg.message);
              setEnrichLog(prev => [...prev, { kind: "skip", title: msg.title ?? msg.message ?? "?" } as EnrichEntry].slice(-100));
            } else if (msg.type === "warn") {
              setEnrichProgress(msg.message);
              setEnrichLog(prev => [...prev, { kind: "warn", message: msg.message } as EnrichEntry].slice(-100));
            } else if (msg.type === "error") {
              throw new Error(msg.message);
            } else if (msg.type === "done") {
              batchDone = msg;
              setEnrichProgress(msg.message);
              setEnrichStats({ checked: msg.checked ?? 0, fixed: msg.fixed ?? 0, total: msg.total ?? 0 });
            }
          }
        }
        if (!batchDone || !batchDone.hasMore) break;
        offset = batchDone.nextOffset ?? offset;
      }
      toast.success("Visual enrichment complete");
      const { data } = await supabase.rpc("get_reference_logs");
      if (data) setRows(data as LogRow[]);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setEnriching(false);
    }
  }


  // ── Reports ──────────────────────────────────────────────────────────────────────────────────────────
  async function resolveReport(id: string) {
    const { error } = await supabase.from("reference_reports").update({ resolved: true }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setReports((prev) => prev.filter((r) => r.id !== id));
    toast.success("Report resolved");
  }

  // ── Guard ──────────────────────────────────────────────────────────────────────────────────────────
  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  // ── Render ──────────────────────────────────────────────────────────────────────────────────────────
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
            onClick={handleProcessNew}
            disabled={processing || countPendingProcess === 0}
            variant="outline"
            className="font-mono text-xs uppercase tracking-widest h-9"
            title="Fill missing metadata and fact-check recent entries in one pass"
          >
            <Sparkles className="h-3.5 w-3.5 mr-2" />
            {processing ? processProgress || "Processing…" : `Process new (${countPendingProcess})`}
          </Button>
          <Button
            type="button"
            onClick={() => handleEnrichVisual(false)}
            disabled={enriching}
            variant="outline"
            className="font-mono text-xs uppercase tracking-widest h-9"
            title="Web-grounded enrichment of visual_summary / editing_style using Firecrawl + AI"
          >
            <Sparkles className="h-3.5 w-3.5 mr-2" />
            {enriching ? enrichProgress || "Enriching…" : "Enrich visual (web)"}
          </Button>
          <Button
            type="button"
            onClick={handleCheckLinks}
            disabled={linkChecking}
            variant="outline"
            className="font-mono text-xs uppercase tracking-widest h-9"
            title="Probe every source URL and flag dead links"
          >
            <Link2 className="h-3.5 w-3.5 mr-2" />
            {linkChecking ? "Checking…" : `Check all links${countDeadLinks > 0 ? ` (${countDeadLinks} dead)` : ""}`}
          </Button>
          {countDeadLinks > 0 && (
            <Button
              type="button"
              onClick={deleteAllDeadLinks}
              disabled={deletingDead}
              variant="outline"
              className="font-mono text-xs uppercase tracking-widest h-9 text-destructive hover:text-destructive"
              title="Permanently delete all references whose link is dead"
            >
              <Link2Off className="h-3.5 w-3.5 mr-2" />
              {deletingDead ? "Deleting…" : `Delete dead (${countDeadLinks})`}
            </Button>
          )}
          {linkResults && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {linkResults.message}
            </span>
          )}
          <button
            type="button"
            onClick={() => handleEnrichVisual(true)}
            disabled={enriching}
            className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 hover:text-foreground transition-colors disabled:opacity-40"
            title="Re-enrich ALL entries, overwriting existing values"
          >
            Force re-enrich
          </button>
        </div>
        {(processing || processingId !== null || processLog.length > 0) && (
          <div className="container pb-3">
            <div className="border hairline bg-secondary/40 max-h-72 overflow-auto p-3 font-mono text-xs leading-relaxed space-y-1.5">
              {(processing || processingId !== null) && (
                <p className="text-primary sticky top-0 bg-secondary/90 backdrop-blur-sm -mx-3 px-3 py-1 mb-1 z-10">
                  {processProgress}
                </p>
              )}
              {processLog.length === 0 && (processing || processingId !== null) ? (
                <p className="text-muted-foreground">Processing entries…</p>
              ) : (
                processLog.map((e, i) =>
                  e.kind === "warn" ? (
                    <p key={i} className="text-yellow-600/80 py-0.5">⚠ {e.message}</p>
                  ) : (
                    <div key={i} className="border hairline bg-background/40 p-2.5">
                      <p className="font-semibold text-foreground mb-1.5 truncate">{e.title}</p>
                      <div className="space-y-1">
                        {e.changes.map((c, j) => (
                          <div key={j} className="flex items-baseline gap-2">
                            <span className="w-14 shrink-0 uppercase tracking-widest text-muted-foreground text-xs">
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
                        <p className="text-xs italic text-muted-foreground/70 mt-1.5">{e.reason}</p>
                      )}
                    </div>
                  ),
                )
              )}
            </div>
          </div>
        )}
        {(enriching || enrichLog.length > 0) && (
          <div className="container pb-3">
            <div className="border hairline bg-secondary/40 max-h-80 overflow-auto">
              <div className="sticky top-0 bg-secondary/90 backdrop-blur-sm px-3 py-2 flex items-center justify-between border-b hairline z-10">
                <span className="font-mono text-xs text-primary">
                  {enriching ? enrichProgress || "Enriching…" : "Visual enrichment complete"}
                </span>
                {enrichStats && (
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {enrichStats.fixed}/{enrichStats.checked} enriched
                  </span>
                )}
              </div>
              <div className="divide-y divide-border/40">
                {enrichLog.length === 0 && enriching && (
                  <p className="px-3 py-2 font-mono text-xs text-muted-foreground">Starting…</p>
                )}
                {enrichLog.map((e, i) =>
                  e.kind === "warn" ? (
                    <p key={i} className="px-3 py-2 font-mono text-xs text-yellow-600/80">⚠ {e.message}</p>
                  ) : e.kind === "skip" ? (
                    <div key={i} className="px-3 py-2 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                      <span className="font-mono text-xs text-muted-foreground truncate">{e.title}</span>
                      <span className="font-mono text-[10px] text-muted-foreground/50 shrink-0 ml-auto">skipped</span>
                    </div>
                  ) : (
                    <div key={i} className="px-3 py-2.5 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          e.strength === "strong" ? "bg-green-500" :
                          e.strength === "weak" ? "bg-yellow-500" : "bg-muted-foreground/40"
                        }`} />
                        <span className="font-mono text-xs text-foreground truncate">{e.title}</span>
                        <span className={`font-mono text-[10px] shrink-0 ml-auto uppercase tracking-widest ${
                          e.strength === "strong" ? "text-green-500/70" :
                          e.strength === "weak" ? "text-yellow-500/70" : "text-muted-foreground/50"
                        }`}>{e.strength}</span>
                      </div>
                      {e.visualSummary && (
                        <p className="font-mono text-[10px] text-muted-foreground/70 leading-relaxed pl-3.5 line-clamp-2">
                          {e.visualSummary}
                        </p>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Tabbed content */}
      <div className="container py-8">
        <Tabs defaultValue="entries">
          <TabsList className="mb-8 font-mono text-xs uppercase tracking-widest">
            <TabsTrigger value="entries">Entries ({rows.length})</TabsTrigger>
          </TabsList>

          {/* ── ENTRIES TAB ────────────────────────────────────────────────────────────────────────────────── */}
          <TabsContent value="entries" className="space-y-6">

            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: "Total entries",
                  value: rows.length,
                  active: typeFilter === "all" && linkFilter === "all" && aiFilter === "all" && visualFilter === "all",
                  onClick: () => { setTypeFilter("all"); setLinkFilter("all"); setAiFilter("all"); setVisualFilter("all"); setSearch(""); },
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
                  label: "Not enriched",
                  value: countNotEnriched,
                  active: visualFilter === "missing",
                  onClick: () => setVisualFilter(visualFilter === "missing" ? "all" : "missing"),
                  warn: countNotEnriched > 0,
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
                  <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    {card.label}
                  </div>
                </button>
              ))}
            </div>

            {/* Filter chips + search */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                {[
                  {
                    label: "Type",
                    node: (
                      <Chips
                        options={[
                          { label: "All", value: "all" as const },
                          { label: "Video", value: "video" as const },
                          { label: "Image", value: "image" as const },
                        ]}
                        value={typeFilter}
                        onChange={(v) => setTypeFilter(v as typeof typeFilter)}
                      />
                    ),
                  },
                  {
                    label: "Link",
                    node: (
                      <Chips
                        options={[
                          { label: "All", value: "all" as const },
                          { label: "OK", value: "ok" as const },
                          { label: "Dead", value: "dead" as const },
                          { label: "Unchecked", value: "unchecked" as const },
                        ]}
                        value={linkFilter}
                        onChange={(v) => setLinkFilter(v as typeof linkFilter)}
                      />
                    ),
                  },
                  {
                    label: "AI",
                    node: (
                      <Chips
                        options={[
                          { label: "All", value: "all" as const },
                          { label: "Enriched", value: "complete" as const },
                          { label: "Missing", value: "missing" as const },
                        ]}
                        value={aiFilter}
                        onChange={(v) => setAiFilter(v as typeof aiFilter)}
                      />
                    ),
                  },
                  {
                    label: "Visual",
                    node: (
                      <Chips
                        options={[
                          { label: "All", value: "all" as const },
                          { label: "Enriched", value: "enriched" as const },
                          { label: "Missing", value: "missing" as const },
                        ]}
                        value={visualFilter}
                        onChange={(v) => setVisualFilter(v as typeof visualFilter)}
                      />
                    ),
                  },
                ].map(({ label, node }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground w-12 shrink-0">
                      {label}
                    </span>
                    {node}
                  </div>
                ))}
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
                  <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
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
                      <TableHead className="font-mono text-xs uppercase tracking-widest w-10">#</TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-widest">
                        <button onClick={() => handleSort("title")} className="flex items-center hover:text-foreground transition-colors">
                          Reference <SortIcon col="title" />
                        </button>
                      </TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-widest">Checks</TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-widest">Added by</TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-widest">Approved by</TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-widest">
                        <button onClick={() => handleSort("approved")} className="flex items-center hover:text-foreground transition-colors">
                          Approved <SortIcon col="approved" />
                        </button>
                      </TableHead>
                      <TableHead className="font-mono text-xs uppercase tracking-widest">
                        <button onClick={() => handleSort("added")} className="flex items-center hover:text-foreground transition-colors">
                          Added <SortIcon col="added" />
                        </button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r, i) => (
                      <Fragment key={r.id}>
                      <TableRow className={expandedVisualId === r.id ? "border-b-0" : ""}>
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
                              <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground truncate max-w-[280px]">
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
                            <button
                              onClick={() => setExpandedVisualId(expandedVisualId === r.id ? null : r.id)}
                              title={
                                r.visual_enriched_at
                                  ? `Visual enriched · ${formatDate(r.visual_enriched_at)} — click to view`
                                  : "Not yet visually enriched"
                              }
                              className={`inline-flex h-5 w-5 items-center justify-center border hairline transition-colors ${
                                r.visual_summary
                                  ? expandedVisualId === r.id
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-primary/10 text-primary hover:bg-primary/20"
                                  : "text-muted-foreground/40 hover:text-muted-foreground"
                              }`}
                            >
                              {r.visual_summary
                                ? <Eye className="h-3 w-3" strokeWidth={2} />
                                : <EyeOff className="h-3 w-3" strokeWidth={1.5} />}
                            </button>
                            <span className="w-px h-3.5 bg-border mx-0.5 shrink-0" />
                            <button
                              onClick={() => handleProcessOne(r.id, r.title)}
                              disabled={!!processingId}
                              title={
                                processingId === r.id ? "Processing…" :
                                r.audited_at ? `Processed · ${formatDate(r.audited_at)} — click to re-run` :
                                "Not yet processed — click to fill & verify with AI"
                              }
                              className={`inline-flex h-5 w-5 items-center justify-center border transition-colors ${
                                processingId === r.id
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
                      {expandedVisualId === r.id && (
                        <TableRow key={`${r.id}-visual`} className="bg-secondary/20 hover:bg-secondary/20">
                          <TableCell />
                          <TableCell colSpan={6} className="pb-4 pt-2">
                            <div className="flex flex-col gap-3">
                              <div>
                                <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-1 flex items-center gap-1.5">
                                  <Eye className="h-2.5 w-2.5" strokeWidth={2} /> Visual Summary
                                </div>
                                {r.visual_summary
                                  ? <p className="font-body text-sm leading-relaxed text-foreground/90">{r.visual_summary}</p>
                                  : <p className="font-mono text-xs text-muted-foreground/50 italic">Not yet enriched</p>}
                              </div>
                              {r.type === "video" && (
                                <div>
                                  <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-1 flex items-center gap-1.5">
                                    <ChevronDown className="h-2.5 w-2.5" strokeWidth={2} /> Editing Style
                                  </div>
                                  {r.editing_style
                                    ? <p className="font-body text-sm leading-relaxed text-foreground/90">{r.editing_style}</p>
                                    : <p className="font-mono text-xs text-muted-foreground/50 italic">Not yet enriched</p>}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
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
