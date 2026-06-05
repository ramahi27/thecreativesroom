import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = {
  user_id: string;
  email: string | null;
  created_at: string;
  is_admin: boolean;
  bookmarks_count: number;
  references_added: number;
  references_approved: number;
  country: string | null;
  time_spent_seconds: number;
};

const formatDate = (s: string) => {
  const d = new Date(s);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const formatDuration = (totalSeconds: number) => {
  const s = Number(totalSeconds || 0);
  if (s <= 0) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
};

const Users = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    document.title = "Admin · Users — The Creatives Room";
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_user_overview");
      if (error) {
        console.error(error);
        setRows([]);
      } else {
        setRows((data as Row[]) || []);
      }
      setLoading(false);
    })();
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.email || "").toLowerCase().includes(q));
  }, [rows, search]);

  const totals = useMemo(
    () => ({
      users: rows.length,
      admins: rows.filter((r) => r.is_admin).length,
      bookmarks: rows.reduce((a, r) => a + r.bookmarks_count, 0),
      added: rows.reduce((a, r) => a + r.references_added, 0),
    }),
    [rows],
  );

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen grain">
      <SiteHeader />

      <section className="border-b hairline">
        <div className="container py-10 md:py-14">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-3">⏵ ADMIN</p>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight mb-2">Users</h1>
          <p className="text-sm text-muted-foreground font-mono">
            All registered users with their bookmarks and contributions.
          </p>
        </div>
      </section>

      <section className="border-b hairline bg-background/80 backdrop-blur-xl">
        <div className="container py-3 flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            <span>{totals.users} users</span>
            <span>{totals.admins} admins</span>
            <span>{totals.bookmarks} bookmarks</span>
            <span>{totals.added} contributions</span>
          </div>
          <div className="relative flex-1 min-w-[200px] max-w-md ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search email…"
              className="pl-9 bg-secondary border-0 font-mono text-xs uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal"
            />
          </div>
        </div>
      </section>

      <section className="container py-8">
        {loading ? (
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">No users.</p>
        ) : (
          <div className="border hairline">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">#</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">Email</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">Role</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">Country</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest text-right">Time on site</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest text-right">Bookmarks</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest text-right">Added</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest text-right">Approved</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, i) => (
                  <TableRow key={r.user_id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-sm truncate max-w-[280px]">{r.email || "—"}</TableCell>
                    <TableCell className="font-mono text-[11px] uppercase tracking-widest">
                      {r.is_admin ? <span className="text-primary">Admin</span> : <span className="text-muted-foreground">User</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.country || "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-right">{formatDuration(r.time_spent_seconds)}</TableCell>
                    <TableCell className="font-mono text-xs text-right">{r.bookmarks_count}</TableCell>
                    <TableCell className="font-mono text-xs text-right">{r.references_added}</TableCell>
                    <TableCell className="font-mono text-xs text-right">{r.references_approved}</TableCell>
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

export default Users;
