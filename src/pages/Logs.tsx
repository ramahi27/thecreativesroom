import { useEffect, useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { PageMeta } from "@/components/PageMeta";
import { SiteFooter } from "@/components/SiteFooter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Sparkles, Check, X as XIcon, Link2, Link2Off, ImageOff, Minus, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { rememberModalReturn, setModalNavOrder } from "@/lib/modalReturn";
import { enrichReferenceMetadata } from "@/lib/enrichMetadata";
import { refPath } from "@/lib/slug";
import { safeHref, detectPlatform } from "@/lib/references";

function hasValue(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().length > 0 : false;
}

// "AI metadata" is considered present once the AI-generated visual_summary exists.
// brand/agency/year are factual fields the AI often cannot determine, so they are
// optional and must not keep a reference permanently in the "missing AI" count.
function hasCompleteMetadata(r: { brand: string | null; agency: string | null; year: number | null; type?: string; editing_style?: string | null; visual_summary?: string | null }): boolean {
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
};

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

const Logs = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<string>("");
  const [auditing, setAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState<string>("");
  const [auditLog, setAuditLog] = useState<string[]>([]);

  const [linkChecking, setLinkChecking] = useState(false);
  const [linkResults, setLinkResults] = useState<{ checked: number; ok: number; dead: number; errored: number; message: string } | null>(null);
  const [deadLinks, setDeadLinks] = useState<Array<{ id: string; title: string; source_url: string | null; link_status: string; link_checked_at: string }>>([]);
  const [deletingDeadId, setDeletingDeadId] = useState<string | null>(null);
  const [deletingAllDead, setDeletingAllDead] = useState(false);

  async function loadDeadLinks() {
    const { data } = await supabase
      .from("references")
      .select("id,title,source_url,link_status,link_checked_at")
      .eq("link_status", "dead")
      .order("link_checked_at", { ascending: false })
      .limit(1000);
    setDeadLinks((data as any) || []);
  }

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
    setDeletingDeadId(id);
    const { error } = await supabase.from("references").delete().eq("id", id);
    setDeletingDeadId(null);
    if (error) return toast.error(error.message);
    setDeadLinks((d) => d.filter((r) => r.id !== id));
    setRows((rs) => rs.filter((r) => r.id !== id));
    toast.success("Reference deleted");
  }

  async function deleteAllDeadLinks() {
    if (deadLinks.length === 0) return;
    if (!confirm(`Delete all ${deadLinks.length} references with dead links? This cannot be undone.`)) return;
    setDeletingAllDead(true);
    const ids = deadLinks.map((r) => r.id);
    const { error } = await supabase.from("references").delete().in("id", ids);
    setDeletingAllDead(false);
    if (error) return toast.error(error.message);
    setDeadLinks([]);
    setRows((rs) => rs.filter((r) => !ids.includes(r.id)));
    toast.success(`Deleted ${ids.length} references`);
  }

  // Fact-check the last 3 days of entries and auto-correct mistakes in
  // title / brand / agency / year (e.g. a wrong brand applied in bulk).
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
          if (msg.type === "progress") {
            setAuditProgress(msg.message);
          } else if (msg.type === "fix") {
            fixed++;
            setAuditProgress(msg.message);
            setAuditLog((prev) => [msg.message, ...prev].slice(0, 50));
          } else if (msg.type === "warn") {
            setAuditLog((prev) => [`⚠ ${msg.message}`, ...prev].slice(0, 50));
          } else if (msg.type === "error") {
            throw new Error(msg.message);
          } else if (msg.type === "done") {
            setAuditProgress(msg.message);
            if (msg.fixed > 0) {
              toast.success(msg.message);
            } else {
              toast.info(msg.message);
            }
          }
        }
      }
      if (fixed > 0) {
        // Refresh the table so corrected fields show without a manual reload.
        const { data } = await supabase.rpc("get_reference_logs");
        if (data) {
          setRows((prev) => {
            const byId = new Map((data as LogRow[]).map((r) => [r.id, r]));
            return prev.map((r) => {
              const fresh = byId.get(r.id);
              return fresh ? { ...r, title: fresh.title, brand: fresh.brand, agency: fresh.agency, year: fresh.year } : r;
            });
          });
        }
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAuditing(false);
    }
  }

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

  async function loadReports() {
    const { data } = await supabase
      .from("reference_reports")
      .select("id,reference_id,field,message,resolved,created_at,references(title)")
      .eq("resolved", false)
      .order("created_at", { ascending: false });
    setReports(
      ((data as any[]) || []).map((r) => ({
        ...r,
        ref_title: r.references?.title ?? r.reference_id,
      })),
    );
  }

  async function resolveReport(id: string) {
    const { error } = await supabase
      .from("reference_reports")
      .update({ resolved: true })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    setReports((prev) => prev.filter((r) => r.id !== id));
    toast.success("Report resolved");
  }

  async function handleBackfillAll() {
    const pending = rows.filter((r) => !r.has_ai_metadata);
    if (pending.length === 0) {
      toast.info("All references already have complete metadata.");
      return;
    }
    if (!confirm(`Generate AI metadata for ${pending.length} reference(s) with missing fields?`)) return;
    setBackfilling(true);
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < pending.length; i++) {
      const r = pending[i];
      setBackfillProgress(`${i + 1}/${pending.length} · ${r.title}`);
      try {
        const before = rows.find((x) => x.id === r.id);
        // Try once, then retry once after a longer pause if the first attempt didn't stick
        await enrichReferenceMetadata(r.id);
        let fresh = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt > 0) await new Promise((res) => setTimeout(res, 3000));
          const { data, error: freshError } = await supabase
            .from("references")
            .select("brand,agency,year,editing_style,visual_summary")
            .eq("id", r.id)
            .maybeSingle();
          if (freshError) throw freshError;
          fresh = data;
          if (hasCompleteMetadata({
            brand: fresh?.brand ?? null,
            agency: fresh?.agency ?? null,
            year: fresh?.year ?? null,
            type: r.type,
            editing_style: (fresh as any)?.editing_style ?? null,
            visual_summary: (fresh as any)?.visual_summary ?? null,
          })) break;
          // First attempt didn't produce visual_summary — retry the AI call
          if (attempt === 0) await enrichReferenceMetadata(r.id);
        }
        const complete = hasCompleteMetadata({
          brand: fresh?.brand ?? null,
          agency: fresh?.agency ?? null,
          year: fresh?.year ?? null,
          type: r.type,
          editing_style: (fresh as any)?.editing_style ?? null,
          visual_summary: (fresh as any)?.visual_summary ?? null,
        });
        if (complete) {
          ok++;
          setRows((prev) =>
            prev.map((x) =>
              x.id === r.id
                ? {
                    ...x,
                    brand: fresh?.brand ?? x.brand,
                    agency: fresh?.agency ?? x.agency,
                    year: fresh?.year ?? x.year,
                    editing_style: (fresh as any)?.editing_style ?? x.editing_style,
                    visual_summary: (fresh as any)?.visual_summary ?? (x as any).visual_summary,
                    has_ai_metadata: true,
                  }
                : x,
            ),
          );
        } else {
          if (before && fresh) {
            setRows((prev) =>
              prev.map((x) =>
                x.id === r.id
                  ? {
                      ...x,
                      brand: fresh!.brand ?? x.brand,
                      agency: fresh!.agency ?? x.agency,
                      year: fresh!.year ?? x.year,
                      editing_style: (fresh as any)?.editing_style ?? x.editing_style,
                      visual_summary: (fresh as any)?.visual_summary ?? x.visual_summary,
                      has_ai_metadata: false,
                    }
                  : x,
              ),
            );
          }
          failed++;
        }
      } catch (error: any) {
        console.error("Backfill failed", r.id, error);
        failed++;
      }
      // 1.2s between calls to avoid hitting the AI gateway rate limit
      await new Promise((res) => setTimeout(res, 1200));
    }
    setBackfilling(false);
    setBackfillProgress("");
    toast.success(`Backfill done · ${ok} updated, ${failed} incomplete`);
  }

  useEffect(() => {
    document.title = "Admin · Logs — The Creatives Room";
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadReports();
    loadDeadLinks();
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_reference_logs");
      if (error) {
        console.error(error);
        setRows([]);
        setLoading(false);
        return;
      }
      const baseRows = (data as LogRow[]) || [];
      // The RPC doesn't include all AI-derived fields; fetch them once in chunks
      // and compute completeness from the same source of truth.
      const ids = baseRows.map((r) => r.id);
      const infoMap = new Map<string, { brand: string | null; agency: string | null; year: number | null; editing_style: string | null; visual_summary: string | null; link_status: string | null; link_checked_at: string | null }>();
      const CHUNK = 150;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data: extra } = await supabase
          .from("references")
          .select("id,brand,agency,year,editing_style,visual_summary,link_status,link_checked_at")
          .in("id", slice);
        (extra || []).forEach((t: any) =>
          infoMap.set(t.id, {
            brand: t.brand ?? null,
            agency: t.agency ?? null,
            year: t.year ?? null,
            editing_style: t.editing_style ?? null,
            visual_summary: t.visual_summary ?? null,
            link_status: t.link_status ?? null,
            link_checked_at: t.link_checked_at ?? null,
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
          };
          return { ...merged, has_ai_metadata: hasCompleteMetadata(merged) } as LogRow;
        }),
      );
      setLoading(false);
    })();
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.title, r.brand, r.created_by_email, r.approved_by_email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen grain">
      <PageMeta title="Admin · Logs — The Creatives Room" description="Reference approval logs." noindex />
      <SiteHeader />

      <section className="border-b hairline">
        <div className="container py-10 md:py-14">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-3">⏵ ADMIN</p>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight mb-2">Logs</h1>
          <p className="text-sm text-muted-foreground font-mono">
            All published references in approval order, with who added and approved each one.
          </p>
        </div>
      </section>

      <section className="border-b hairline bg-background/80 backdrop-blur-xl">
        <div className="container py-3 flex flex-wrap items-center gap-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "entry" : "entries"} · {rows.filter((r) => !r.has_ai_metadata).length} missing AI
          </span>
          <Button
            type="button"
            onClick={handleBackfillAll}
            disabled={backfilling || rows.filter((r) => !r.has_ai_metadata).length === 0}
            variant="outline"
            className="font-mono text-[11px] uppercase tracking-widest h-9"
          >
            <Sparkles className="h-3.5 w-3.5 mr-2" />
            {backfilling ? backfillProgress || "Generating…" : `Backfill missing (${rows.filter((r) => !r.has_ai_metadata).length})`}
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
          <div className="relative flex-1 min-w-[200px] max-w-md ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, brand, email…"
              className="pl-9 bg-secondary border-0 font-mono text-xs uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal"
            />
          </div>
        </div>
        {(auditing || auditLog.length > 0) && (
          <div className="container pb-3">
            <div className="border hairline bg-secondary/40 max-h-48 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
              {auditing && <p className="text-primary mb-1">{auditProgress}</p>}
              {auditLog.length === 0 && auditing ? (
                <p className="text-muted-foreground">Checking entries…</p>
              ) : (
                auditLog.map((line, i) => (
                  <p key={i} className={line.startsWith("⚠") ? "text-muted-foreground" : ""}>{line}</p>
                ))
              )}
            </div>
          </div>
        )}
      </section>

      {reports.length > 0 && (
        <section className="container py-8 border-b hairline">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary mb-4">
            ⏵ {reports.length} pending report{reports.length !== 1 ? "s" : ""}
          </p>
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
        </section>
      )}

      <section className="container py-8 border-b hairline">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
            ⏵ Link health
          </p>
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
          <p className="font-mono text-xs text-muted-foreground mb-4">{linkResults.message}</p>
        )}
        {deadLinks.length > 0 ? (
          <div className="border hairline">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">Reference</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">URL</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">Checked at</TableHead>
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
                      {ref.source_url ? (
                        <a href={ref.source_url} target="_blank" rel="noopener noreferrer"
                          className="font-mono text-xs text-muted-foreground hover:text-foreground truncate max-w-[300px] block">
                          {ref.source_url}
                        </a>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatDate(ref.link_checked_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">
            No dead links detected. Run a check to scan up to 40 stale references.
          </p>
        )}
      </section>

      <section className="container py-8">
        {loading ? (
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">No entries.</p>
        ) : (
          <div className="border hairline">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">#</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">Reference</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">Checks</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">Added by</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">Approved by</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">Approved at</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">Added at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <Link to={refPath(r.id, r.title)} onClick={() => { rememberModalReturn(); setModalNavOrder(filtered.map((x) => x.id)); }} className="flex items-center gap-3 hover:opacity-80">
                        {r.thumbnail_url ? (
                          <img
                            src={r.thumbnail_url}
                            alt=""
                            className="h-10 w-16 object-cover border hairline"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-10 w-16 bg-muted border hairline" />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm truncate max-w-[320px]">{r.title}</div>
                          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground truncate max-w-[320px]">
                            {[r.brand, r.year, r.type].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {/* AI metadata */}
                        <span
                          title={r.has_ai_metadata ? "AI metadata complete" : "Missing AI metadata (visual summary)"}
                          className={`inline-flex h-5 w-5 items-center justify-center border hairline ${r.has_ai_metadata ? "bg-primary/10 text-primary" : "text-muted-foreground/40"}`}
                        >
                          <Sparkles className="h-3 w-3" strokeWidth={r.has_ai_metadata ? 2 : 1.5} />
                        </span>
                        {/* Link status */}
                        <span
                          title={
                            r.link_status === "ok" ? `Link OK · checked ${formatDate(r.link_checked_at ?? null)}` :
                            r.link_status === "dead" ? `Dead link · checked ${formatDate(r.link_checked_at ?? null)}` :
                            r.link_status === "error" ? `Link error · checked ${formatDate(r.link_checked_at ?? null)}` :
                            "Link not yet checked"
                          }
                          className={`inline-flex h-5 w-5 items-center justify-center border hairline ${
                            r.link_status === "ok" ? "bg-primary/10 text-primary" :
                            r.link_status === "dead" ? "bg-destructive/15 text-destructive" :
                            r.link_status === "error" ? "bg-yellow-500/10 text-yellow-500" :
                            "text-muted-foreground/40"
                          }`}
                        >
                          {r.link_status === "ok" ? <Link2 className="h-3 w-3" strokeWidth={2} /> :
                           r.link_status === "dead" ? <Link2Off className="h-3 w-3" strokeWidth={2} /> :
                           r.link_status === "error" ? <Link2 className="h-3 w-3" strokeWidth={1.5} /> :
                           <Link2 className="h-3 w-3" strokeWidth={1} />}
                        </span>
                        {/* Thumbnail */}
                        <span
                          title={r.thumbnail_url ? "Has thumbnail" : "No thumbnail"}
                          className={`inline-flex h-5 w-5 items-center justify-center border hairline ${r.thumbnail_url ? "bg-primary/10 text-primary" : "text-muted-foreground/40"}`}
                        >
                          {r.thumbnail_url
                            ? <Check className="h-3 w-3" strokeWidth={2.5} />
                            : <ImageOff className="h-3 w-3" strokeWidth={1.5} />}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.created_by_email || (r.created_by ? "—" : "system")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.approved_by_email || (r.approved_by ? "—" : "—")}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{formatDate(r.approved_at)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <SiteFooter />
    </div>
  );
};

export default Logs;
