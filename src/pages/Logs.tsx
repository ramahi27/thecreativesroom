import { useEffect, useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
      } else {
        setRows((data as LogRow[]) || []);
      }
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
            {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
          </span>
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
