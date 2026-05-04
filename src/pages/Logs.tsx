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

const AI_MARKER = "ai:processed";
function hasAiMetadata(tags: string[] | null | undefined): boolean {
  if (!Array.isArray(tags)) return false;
  return tags.some((t) => t.toLowerCase() === AI_MARKER);
}

function metadataToTags(m: any): string[] {
  const out: string[] = [AI_MARKER];
  if (Array.isArray(m?.tags)) out.push(...m.tags.map((t: string) => String(t).trim().toLowerCase()).filter(Boolean));
  return out;
}

type LogRow = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  brand: string | null;
  type: string;
  year: number | null;
  created_at: string;
  approved_at: string | null;
  created_by: string | null;
  approved_by: string | null;
  created_by_email: string | null;
  approved_by_email: string | null;
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
      toast.info("All references already have AI metadata.");
      return;
    }
    if (!confirm(`Generate AI metadata for ${pending.length} reference(s) without metadata?`)) return;
    setBackfilling(true);
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < pending.length; i++) {
      const r = pending[i];
      setBackfillProgress(`${i + 1}/${pending.length} · ${r.title}`);
      try {
        const { data: ref } = await supabase
          .from("references")
          .select("tags")
          .eq("id", r.id)
          .maybeSingle();
        const existing: string[] = Array.isArray(ref?.tags) ? (ref!.tags as string[]) : [];
        const { data, error } = await supabase.functions.invoke("generate-metadata", {
          body: { title: r.title, brand: r.brand },
        });
        const meta = (data as any)?.metadata;
        if (error || !meta) {
          failed++;
          continue;
        }
        const newTags = metadataToTags(meta);
        const merged = Array.from(new Set([...existing, ...newTags]));
        const { error: upErr } = await supabase
          .from("references")
          .update({ tags: merged })
          .eq("id", r.id);
        if (upErr) failed++;
        else {
          ok++;
          setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, has_ai_metadata: true } : x)));
        }
      } catch {
        failed++;
      }
      await new Promise((res) => setTimeout(res, 400));
    }
    setBackfilling(false);
    setBackfillProgress("");
    toast.success(`Backfill done · ${ok} updated, ${failed} failed`);
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
      // Fetch tags for all rows to determine AI metadata state
      const ids = baseRows.map((r) => r.id);
      let infoMap = new Map<string, { tags: string[]; notes: string | null }>();
      if (ids.length) {
        const { data: tagRows } = await supabase
          .from("references")
          .select("id,tags,notes")
          .in("id", ids);
        (tagRows || []).forEach((t: any) => infoMap.set(t.id, { tags: t.tags || [], notes: t.notes }));
      }
      setRows(baseRows.map((r) => {
        const info = infoMap.get(r.id);
        return { ...r, has_ai_metadata: hasAiMetadata(info?.tags, info?.notes) };
      }));
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
                      <Link to={`/ref/${r.id}`} className="flex items-center gap-3 hover:opacity-80">
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
