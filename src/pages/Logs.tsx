import { useEffect, useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Sparkles, Check, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { rememberModalReturn, setModalNavOrder } from "@/lib/modalReturn";
import { enrichReferenceMetadata } from "@/lib/enrichMetadata";

function hasValue(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().length > 0 : false;
}

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
      const infoMap = new Map<string, { brand: string | null; agency: string | null; year: number | null; editing_style: string | null; visual_summary: string | null }>();
      const CHUNK = 150;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data: extra } = await supabase
          .from("references")
          .select("id,brand,agency,year,editing_style,visual_summary")
          .in("id", slice);
        (extra || []).forEach((t: any) =>
          infoMap.set(t.id, {
            brand: t.brand ?? null,
            agency: t.agency ?? null,
            year: t.year ?? null,
            editing_style: t.editing_style ?? null,
            visual_summary: t.visual_summary ?? null,
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
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">AI</TableHead>
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
                      <Link to={`/ref/${r.id}`} onClick={() => { rememberModalReturn(); setModalNavOrder(filtered.map((x) => x.id)); }} className="flex items-center gap-3 hover:opacity-80">
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
                      {r.has_ai_metadata ? (
                        <span title="Has AI metadata" className="inline-flex h-5 w-5 items-center justify-center border hairline bg-primary/10 text-primary">
                          <Check className="h-3 w-3" strokeWidth={2.5} />
                        </span>
                      ) : (
                        <span title="Missing AI metadata" className="inline-flex h-5 w-5 items-center justify-center border hairline text-muted-foreground">
                          <XIcon className="h-3 w-3" strokeWidth={2} />
                        </span>
                      )}
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
