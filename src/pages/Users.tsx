import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { PageMeta } from "@/components/PageMeta";
import { SiteFooter } from "@/components/SiteFooter";
import { Input } from "@/components/ui/input";
import { Search, MessageSquare, Lightbulb, Bug, Reply, Trash2, Zap, ZapOff } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type Plan = "free" | "paid";
type FilterKey = "all" | "free" | "pro" | "admin";

type Row = {
  user_id: string;
  username: string;
  created_at: string;
  is_admin: boolean;
  plan: Plan;
  references_added: number;
  references_approved: number;
  time_spent_seconds: number;
};

type FeedbackRow = {
  id: string;
  type: string;
  message: string;
  email: string | null;
  user_id: string | null;
  created_at: string;
  username?: string;
};

const FEEDBACK_ICONS: Record<string, React.ElementType> = {
  question:   MessageSquare,
  suggestion: Lightbulb,
  bug:        Bug,
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
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleTogglePlan(row: Row) {
    if (row.is_admin) return;
    const next: Plan = row.plan === "paid" ? "free" : "paid";
    setTogglingId(row.user_id);
    const { error } = await supabase
      .from("profiles")
      .update({ plan: next })
      .eq("user_id", row.user_id);
    setTogglingId(null);
    if (error) { toast.error(error.message); return; }
    setRows((prev) => prev.map((r) => r.user_id === row.user_id ? { ...r, plan: next } : r));
    toast.success(next === "paid" ? `@${row.username} upgraded to Pro` : `@${row.username} downgraded to Free`);
  }

  async function handleDeleteFeedback(id: string) {
    setDeletingId(id);
    await supabase.from("feedback" as any).delete().eq("id", id);
    setFeedback((prev) => prev.filter((f) => f.id !== id));
    setDeletingId(null);
  }

  useEffect(() => {
    document.title = "Admin · Users — The Creatives Room";
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setLoading(true);
      setFetchError(null);

      // Build the overview entirely from tables the admin can already read,
      // so it doesn't depend on a server-side function.
      const [profilesRes, rolesRes, refsRes, viewsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, username, created_at, plan").limit(500),
        supabase.from("user_roles").select("user_id").eq("role", "admin").limit(500),
        supabase.from("references").select("created_by, approved_by").eq("published", true).limit(5000),
        supabase.from("page_views").select("user_id, duration_seconds").not("user_id", "is", null).limit(10000),
      ]);

      const firstError = profilesRes.error || rolesRes.error || refsRes.error || viewsRes.error;
      if (firstError) {
        console.error(firstError);
        setFetchError(firstError.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const adminIds = new Set((rolesRes.data || []).map((r) => r.user_id));

      const addedBy = new Map<string, number>();
      const approvedBy = new Map<string, number>();
      for (const r of refsRes.data || []) {
        if (r.created_by) addedBy.set(r.created_by, (addedBy.get(r.created_by) || 0) + 1);
        if (r.approved_by) approvedBy.set(r.approved_by, (approvedBy.get(r.approved_by) || 0) + 1);
      }

      const timeBy = new Map<string, number>();
      for (const v of viewsRes.data || []) {
        if (v.user_id) timeBy.set(v.user_id, (timeBy.get(v.user_id) || 0) + (v.duration_seconds || 0));
      }

      const built: Row[] = (profilesRes.data || [])
        .map((p) => ({
          user_id: p.user_id,
          username: p.username,
          created_at: p.created_at,
          is_admin: adminIds.has(p.user_id),
          plan: ((p as any).plan as Plan) || "free",
          references_added: addedBy.get(p.user_id) || 0,
          references_approved: approvedBy.get(p.user_id) || 0,
          time_spent_seconds: timeBy.get(p.user_id) || 0,
        }))
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

      setRows(built);
      setLoading(false);

      // Fetch feedback messages
      setFeedbackLoading(true);
      const { data: fbData } = await supabase
        .from("feedback" as any)
        .select("id, type, message, email, user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (fbData) {
        const userIds = [...new Set((fbData as any[]).filter((f) => f.user_id).map((f) => f.user_id))];
        let usernameMap: Record<string, string> = {};
        if (userIds.length) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, username")
            .in("user_id", userIds);
          for (const p of profiles || []) usernameMap[p.user_id] = p.username;
        }
        setFeedback((fbData as any[]).map((f) => ({ ...f, username: f.user_id ? usernameMap[f.user_id] : undefined })));
      }
      setFeedbackLoading(false);
    })();
  }, [isAdmin]);

  const filtered = useMemo(() => {
    let result = rows;
    if (filter === "pro")   result = result.filter((r) => r.plan === "paid" && !r.is_admin);
    if (filter === "free")  result = result.filter((r) => r.plan === "free" && !r.is_admin);
    if (filter === "admin") result = result.filter((r) => r.is_admin);
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((r) => (r.username || "").toLowerCase().includes(q));
    return result;
  }, [rows, search, filter]);

  const totals = useMemo(
    () => ({
      users: rows.length,
      pro: rows.filter((r) => r.plan === "paid" && !r.is_admin).length,
      admins: rows.filter((r) => r.is_admin).length,
      added: rows.reduce((a, r) => a + r.references_added, 0),
    }),
    [rows],
  );

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen grain">
      <PageMeta title="Admin · Users — The Creatives Room" description="User management." noindex />
      <SiteHeader />

      <section className="border-b hairline">
        <div className="container py-10 md:py-14">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-3">⏵ ADMIN</p>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight mb-2">Users</h1>
          <p className="text-sm text-muted-foreground font-mono">
            All registered users with their contributions.
          </p>
        </div>
      </section>

      <section className="border-b hairline bg-background/80 backdrop-blur-xl">
        <div className="container py-3 flex flex-wrap items-center gap-3">
          {/* Filter pills */}
          <div className="flex gap-1.5 flex-wrap">
            {([
              { key: "all",   label: `All (${totals.users})` },
              { key: "free",  label: `Free (${totals.users - totals.pro - totals.admins})` },
              { key: "pro",   label: `Pro (${totals.pro})` },
              { key: "admin", label: `Admin (${totals.admins})` },
            ] as { key: FilterKey; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full transition-all ${
                  filter === key
                    ? "bg-foreground text-background"
                    : "border hairline text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[180px] max-w-md ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search username…"
              className="pl-9 bg-secondary border-0 font-mono text-xs uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal"
            />
          </div>
        </div>
      </section>

      <section className="container py-8">
        {loading ? (
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading…</p>
        ) : fetchError ? (
          <p className="font-mono text-xs uppercase tracking-widest text-destructive">Error: {fetchError}</p>
        ) : filtered.length === 0 ? (
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">No users.</p>
        ) : (
          <div className="border hairline">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">#</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">Username</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">Plan</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest text-right">Time on site</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest text-right">Added</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest text-right">Approved</TableHead>
                  <TableHead className="font-mono text-[11px] uppercase tracking-widest">Joined</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, i) => (
                  <TableRow key={r.user_id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-sm truncate max-w-[200px]">{r.username || "—"}</TableCell>
                    <TableCell>
                      {r.is_admin ? (
                        <span className="font-mono text-[10px] uppercase tracking-widest text-primary">Admin</span>
                      ) : r.plan === "paid" ? (
                        <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/15 text-primary">Pro</span>
                      ) : (
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Free</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right">{formatDuration(r.time_spent_seconds)}</TableCell>
                    <TableCell className="font-mono text-xs text-right">{r.references_added}</TableCell>
                    <TableCell className="font-mono text-xs text-right">{r.references_approved}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                    <TableCell className="text-right">
                      {!r.is_admin && (
                        <button
                          onClick={() => handleTogglePlan(r)}
                          disabled={togglingId === r.user_id}
                          title={r.plan === "paid" ? "Downgrade to Free" : "Upgrade to Pro"}
                          className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full border transition-all disabled:opacity-40 ${
                            r.plan === "paid"
                              ? "border-border text-muted-foreground hover:border-destructive/50 hover:text-destructive"
                              : "border-primary/30 text-primary hover:bg-primary/10"
                          }`}
                        >
                          {togglingId === r.user_id ? (
                            "…"
                          ) : r.plan === "paid" ? (
                            <><ZapOff className="h-3 w-3" strokeWidth={2} /> Revoke</>
                          ) : (
                            <><Zap className="h-3 w-3" strokeWidth={2} /> Upgrade</>
                          )}
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Feedback */}
      <section className="container py-8 border-t hairline mt-4">
        <div className="flex items-baseline gap-3 mb-6">
          <h2 className="font-display text-2xl font-bold tracking-tight">Feedback</h2>
          {!feedbackLoading && (
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {feedback.length} message{feedback.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {feedbackLoading ? (
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading…</p>
        ) : feedback.length === 0 ? (
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">No messages yet.</p>
        ) : (
          <div className="space-y-3">
            {feedback.map((f) => {
              const Icon = FEEDBACK_ICONS[f.type] || MessageSquare;
              return (
                <div key={f.id} className="border hairline rounded-2xl p-5 flex gap-4">
                  <div className="shrink-0 mt-0.5">
                    <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
                        {f.type}
                      </span>
                      {(f.username || f.email) && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {f.username ? `@${f.username}` : f.email}
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-muted-foreground/50 ml-auto">
                        {formatDate(f.created_at)}
                      </span>
                    </div>
                    <p className="font-body text-sm leading-relaxed">{f.message}</p>
                    <div className="flex items-center gap-3 mt-3">
                      {f.email && f.username && (
                        <span className="font-mono text-[10px] text-muted-foreground/60">{f.email}</span>
                      )}
                      <div className="flex items-center gap-3 ml-auto">
                        {f.email && (
                          <a
                            href={`mailto:${f.email}?subject=Re: your message on The Creatives Room&body=%0A%0A---%0AOriginal message:%0A"${encodeURIComponent(f.message)}"`}
                            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-primary hover:underline"
                          >
                            <Reply className="h-3 w-3" strokeWidth={2} />
                            Reply
                          </a>
                        )}
                        <button
                          onClick={() => handleDeleteFeedback(f.id)}
                          disabled={deletingId === f.id}
                          className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="h-3 w-3" strokeWidth={2} />
                          {deletingId === f.id ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <SiteFooter />
    </div>
  );
};

export default Users;
