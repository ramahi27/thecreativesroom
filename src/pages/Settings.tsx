import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { PageMeta } from "@/components/PageMeta";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { X, Plus, Shield, Trash2, BarChart3, Users, Eye, Bookmark, Clock } from "lucide-react";
import { rememberModalReturn, setModalNavOrder } from "@/lib/modalReturn";

interface AdminStats {
  total_visitors: number;
  visitors_7d: number;
  visitors_30d: number;
  total_views: number;
  views_7d: number;
  registered_accounts: number;
  accounts_7d: number;
  total_references: number;
  total_bookmarks: number;
  avg_session_seconds: number;
  avg_view_seconds: number;
  top_visited: Array<{ id: string; title: string; thumbnail_url: string | null; brand: string | null; views: number; unique_visitors: number; avg_seconds: number }>;
  top_bookmarked: Array<{ id: string; title: string; thumbnail_url: string | null; brand: string | null; bookmark_count: number }>;
}

function formatDuration(s: number) {
  if (!s) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return sec ? `${m}m ${sec}s` : `${m}m`;
}

interface AdminRow {
  user_id: string;
  email: string;
  created_at: string;
}

const Settings = () => {
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();

  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(true);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [adding, setAdding] = useState(false);


  const [videoCats, setVideoCats] = useState<string[]>([]);
  const [photoCats, setPhotoCats] = useState<string[]>([]);
  const [newVideo, setNewVideo] = useState("");
  const [newPhoto, setNewPhoto] = useState("");
  const [catsLoading, setCatsLoading] = useState(true);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    document.title = "Settings — The Creatives Room";
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadAdmins();
    loadCategories();
    loadStats();
  }, [isAdmin]);

  async function loadStats() {
    setStatsLoading(true);
    const { data, error } = await supabase.rpc("get_admin_stats");
    if (error) toast.error(error.message);
    else setStats(data as unknown as AdminStats);
    setStatsLoading(false);
  }

  async function loadAdmins() {
    setAdminsLoading(true);
    const { data, error } = await supabase.rpc("list_admins");
    if (error) toast.error(error.message);
    setAdmins((data as AdminRow[]) || []);
    setAdminsLoading(false);
  }

  async function loadCategories() {
    setCatsLoading(true);
    const { data } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["video_categories", "photo_categories"]);
    const map = new Map((data || []).map((r: any) => [r.key, r.value]));
    setVideoCats((map.get("video_categories") as string[]) || []);
    setPhotoCats((map.get("photo_categories") as string[]) || []);
    setCatsLoading(false);
  }

  async function handleAddAdmin(e: React.FormEvent) {
    e.preventDefault();
    const email = newAdminEmail.trim().toLowerCase();
    if (!email) return;
    setAdding(true);
    try {
      const { data: uid, error: lookupErr } = await supabase.rpc("get_user_id_by_email", { _email: email });
      if (lookupErr) throw lookupErr;
      if (!uid) {
        toast.error("No user found with that email. They must sign up first.");
        return;
      }
      const { error } = await supabase.from("user_roles").insert({ user_id: uid as string, role: "admin" });
      if (error) {
        if (error.code === "23505") toast.info("Already an admin");
        else throw error;
      } else {
        toast.success(`Added ${email} as admin`);
      }
      setNewAdminEmail("");
      loadAdmins();
    } catch (err: any) {
      toast.error(err.message || "Failed to add admin");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveAdmin(userId: string, email: string) {
    if (userId === user?.id) {
      toast.error("You can't remove yourself.");
      return;
    }
    if (!confirm(`Remove admin access for ${email}?`)) return;
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "admin");
    if (error) toast.error(error.message);
    else {
      toast.success("Admin removed");
      loadAdmins();
    }
  }

  async function saveCategories(key: "video_categories" | "photo_categories", values: string[]) {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key, value: values as any }, { onConflict: "key" });
    if (error) {
      toast.error(error.message);
      return false;
    }
    return true;
  }

  async function addCategory(kind: "video" | "photo") {
    const value = (kind === "video" ? newVideo : newPhoto).trim();
    if (!value) return;
    const list = kind === "video" ? videoCats : photoCats;
    if (list.some((c) => c.toLowerCase() === value.toLowerCase())) {
      toast.info("Category already exists");
      return;
    }
    const next = [...list, value];
    const ok = await saveCategories(
      kind === "video" ? "video_categories" : "photo_categories",
      next,
    );
    if (ok) {
      kind === "video" ? setVideoCats(next) : setPhotoCats(next);
      kind === "video" ? setNewVideo("") : setNewPhoto("");
      toast.success("Category added");
    }
  }

  async function removeCategory(kind: "video" | "photo", name: string) {
    if (!confirm(`Remove "${name}"? Existing references keep this label until edited.`)) return;
    const list = kind === "video" ? videoCats : photoCats;
    const next = list.filter((c) => c !== name);
    const ok = await saveCategories(
      kind === "video" ? "video_categories" : "photo_categories",
      next,
    );
    if (ok) {
      kind === "video" ? setVideoCats(next) : setPhotoCats(next);
      toast.success("Category removed");
    }
  }

  async function renameCategory(kind: "video" | "photo", oldName: string) {
    const newName = prompt(`Rename "${oldName}" to:`, oldName)?.trim();
    if (!newName || newName === oldName) return;
    const list = kind === "video" ? videoCats : photoCats;
    if (list.some((c) => c.toLowerCase() === newName.toLowerCase())) {
      toast.info("That category already exists");
      return;
    }
    const next = list.map((c) => (c === oldName ? newName : c));
    const ok = await saveCategories(
      kind === "video" ? "video_categories" : "photo_categories",
      next,
    );
    if (ok) {
      kind === "video" ? setVideoCats(next) : setPhotoCats(next);
      const { data: affected, error } = await supabase.rpc("rename_category", { _old: oldName, _new: newName });
      if (error) toast.error(`Renamed, but failed to update projects: ${error.message}`);
      else toast.success(`Renamed · ${affected ?? 0} project${affected === 1 ? "" : "s"} updated`);
    }
  }

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen grain">
      <PageMeta title="Settings — The Creatives Room" description="Admin settings." noindex />
      <SiteHeader />

      <section className="border-b hairline">
        <div className="container py-12 md:py-16">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-4">⏵ Admin</p>
          <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[0.9]">
            <span className="italic font-light">Settings</span>.
          </h1>
        </div>
      </section>

      <main className="container py-12 max-w-5xl space-y-16 font-serif">
        {/* Analytics */}
        <section>
          <header className="flex items-center gap-3 mb-6">
            <BarChart3 className="h-5 w-5 text-primary" strokeWidth={1.5} />
            <h2 className="text-3xl font-black tracking-tighter font-serif">Analytics</h2>
          </header>

          {statsLoading || !stats ? (
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border hairline mb-8">
                <StatCell icon={<Users className="h-3.5 w-3.5" />} label="Visitors" value={stats.total_visitors.toLocaleString()} sub={`${stats.visitors_7d} last 7d`} />
                <StatCell icon={<Eye className="h-3.5 w-3.5" />} label="Page views" value={stats.total_views.toLocaleString()} sub={`${stats.views_7d} last 7d`} />
                <StatCell icon={<Shield className="h-3.5 w-3.5" />} label="Accounts" value={stats.registered_accounts.toLocaleString()} sub={`+${stats.accounts_7d} last 7d`} />
                <StatCell icon={<Bookmark className="h-3.5 w-3.5" />} label="Bookmarks" value={stats.total_bookmarks.toLocaleString()} sub={`${stats.total_references} projects`} />
                <StatCell icon={<Clock className="h-3.5 w-3.5" />} label="Avg. session" value={formatDuration(stats.avg_session_seconds)} sub="per visitor / hour" />
                <StatCell icon={<Clock className="h-3.5 w-3.5" />} label="Avg. on page" value={formatDuration(stats.avg_view_seconds)} sub="per view" />
                <StatCell icon={<Users className="h-3.5 w-3.5" />} label="Visitors 30d" value={stats.visitors_30d.toLocaleString()} sub="unique" />
                <StatCell icon={<Eye className="h-3.5 w-3.5" />} label="Views / visitor" value={stats.total_visitors ? (stats.total_views / stats.total_visitors).toFixed(1) : "—"} sub="lifetime" />
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <p className="uppercase tracking-[0.25em] text-muted-foreground mb-3 font-serif text-lg">Most visited projects</p>
                  <div className="border hairline divide-y">
                    {stats.top_visited.length === 0 ? (
                      <p className="p-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">No data yet</p>
                    ) : stats.top_visited.map((p, i) => (
                      <button key={p.id} onClick={() => { rememberModalReturn(); setModalNavOrder(stats.top_visited.map((x) => x.id)); navigate(`/ref/${p.id}`); }} className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/50 transition-colors">
                        <span className="font-mono text-[10px] text-muted-foreground w-5">{(i + 1).toString().padStart(2, "0")}</span>
                        <div className="w-12 h-8 bg-secondary shrink-0 overflow-hidden">
                          {p.thumbnail_url && <img src={p.thumbnail_url} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-xs truncate">{p.title}</p>
                          {p.brand && <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground truncate">{p.brand}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-xs">{p.views}</p>
                          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{p.unique_visitors} uniq · {formatDuration(Number(p.avg_seconds))}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="uppercase tracking-[0.25em] text-muted-foreground mb-3 font-serif text-lg">Most bookmarked projects</p>
                  <div className="border hairline divide-y">
                    {stats.top_bookmarked.length === 0 ? (
                      <p className="p-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">No bookmarks yet</p>
                    ) : stats.top_bookmarked.map((p, i) => (
                      <button key={p.id} onClick={() => { rememberModalReturn(); setModalNavOrder(stats.top_bookmarked.map((x) => x.id)); navigate(`/ref/${p.id}`); }} className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/50 transition-colors">
                        <span className="font-mono text-[10px] text-muted-foreground w-5">{(i + 1).toString().padStart(2, "0")}</span>
                        <div className="w-12 h-8 bg-secondary shrink-0 overflow-hidden">
                          {p.thumbnail_url && <img src={p.thumbnail_url} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-xs truncate">{p.title}</p>
                          {p.brand && <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground truncate">{p.brand}</p>}
                        </div>
                        <div className="text-right shrink-0 flex items-center gap-1">
                          <Bookmark className="h-3 w-3" />
                          <p className="font-mono text-xs">{p.bookmark_count}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Admins */}
        <section>
          <header className="flex items-center gap-3 mb-6">
            <Shield className="h-5 w-5 text-primary" strokeWidth={1.5} />
            <h2 className="text-3xl font-black tracking-tighter font-serif">Admin team</h2>
          </header>

          <form onSubmit={handleAddAdmin} className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="flex-1 space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Add admin by email
              </Label>
              <Input
                type="email"
                required
                placeholder="user@example.com"
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                className="bg-secondary border-0 font-mono"
              />
            </div>
            <Button
              type="submit"
              disabled={adding}
              className="font-mono text-xs uppercase tracking-widest h-10 sm:self-end"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {adding ? "Adding…" : "Add admin"}
            </Button>
          </form>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground -mt-3 mb-6">
            User must already have an account.
          </p>

          <div className="border hairline divide-y">
            {adminsLoading ? (
              <p className="p-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Loading…
              </p>
            ) : admins.length === 0 ? (
              <p className="p-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                No admins.
              </p>
            ) : (
              admins.map((a) => (
                <div key={a.user_id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="font-body text-sm truncate">{a.email}</p>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
                      Since {new Date(a.created_at).toLocaleDateString()}
                      {a.user_id === user?.id && <span className="ml-2 text-primary">· you</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveAdmin(a.user_id, a.email)}
                    disabled={a.user_id === user?.id}
                    className="p-2 text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Remove admin"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Import via link moved to Drafts page */}
        {/* Categories */}
        <section>
          <h2 className="text-3xl font-black tracking-tighter mb-6 font-serif">Categories</h2>

          {catsLoading ? (
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Loading…
            </p>
          ) : (
            <div className="grid md:grid-cols-2 gap-8">
              <CategoryEditor
                title="Video"
                items={videoCats}
                newValue={newVideo}
                onNewValue={setNewVideo}
                onAdd={() => addCategory("video")}
                onRemove={(c) => removeCategory("video", c)}
                onRename={(c) => renameCategory("video", c)}
              />
              <CategoryEditor
                title="Photo"
                items={photoCats}
                newValue={newPhoto}
                onNewValue={setNewPhoto}
                onAdd={() => addCategory("photo")}
                onRemove={(c) => removeCategory("photo", c)}
                onRename={(c) => renameCategory("photo", c)}
              />
            </div>
          )}
        </section>

      </main>
    </div>
  );
};


function CategoryEditor({
  title,
  items,
  newValue,
  onNewValue,
  onAdd,
  onRemove,
  onRename,
}: {
  title: string;
  items: string[];
  newValue: string;
  onNewValue: (v: string) => void;
  onAdd: () => void;
  onRemove: (c: string) => void;
  onRename: (c: string) => void;
}) {
  return (
    <div>
      <p className="uppercase tracking-[0.25em] text-muted-foreground mb-3 font-serif text-lg">
        {title}
      </p>
      <div className="space-y-2 mb-4">
        {items.map((c) => (
          <div
            key={c}
            className="flex items-center justify-between gap-2 bg-secondary px-3 py-2"
          >
            <button
              onClick={() => onRename(c)}
              className="font-mono text-xs uppercase tracking-widest text-left flex-1 hover:text-primary"
              title="Click to rename"
            >
              {c}
            </button>
            <button
              onClick={() => onRemove(c)}
              className="text-muted-foreground hover:text-destructive"
              aria-label={`Remove ${c}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            None yet.
          </p>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAdd();
        }}
        className="flex gap-2"
      >
        <Input
          value={newValue}
          onChange={(e) => onNewValue(e.target.value)}
          placeholder="New category"
          className="bg-secondary border-0 font-mono text-xs"
        />
        <Button type="submit" size="sm" className="font-mono text-xs uppercase tracking-widest">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
}

function StatCell({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-background p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
        {icon}
        <p className="uppercase tracking-[0.2em] font-serif text-lg">{label}</p>
      </div>
      <p className="font-display text-2xl font-black tracking-tighter">{value}</p>
      {sub && <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default Settings;
