import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { X, Plus, Shield, Trash2, Sparkles, Link2, ExternalLink } from "lucide-react";

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

  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [recentScrapes, setRecentScrapes] = useState<
    { id: string; title: string; thumbnail_url: string | null; brand: string | null }[]
  >([]);

  const [videoCats, setVideoCats] = useState<string[]>([]);
  const [photoCats, setPhotoCats] = useState<string[]>([]);
  const [newVideo, setNewVideo] = useState("");
  const [newPhoto, setNewPhoto] = useState("");
  const [catsLoading, setCatsLoading] = useState(true);

  useEffect(() => {
    document.title = "Settings — The Creatives Room";
    if (!authLoading && (!user || !isAdmin)) navigate("/");
  }, [authLoading, user, isAdmin, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    loadAdmins();
    loadCategories();
  }, [isAdmin]);

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

  async function handleScrape(e: React.FormEvent) {
    e.preventDefault();
    const url = scrapeUrl.trim();
    if (!url) return;
    setScraping(true);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-link", { body: { url } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to scrape");
      if (data.playlist) {
        toast.success(`Playlist imported — ${data.count} drafts created`, {
          description: data.failed_count
            ? `${data.failed_count} video(s) failed`
            : "All videos saved as drafts",
          action: { label: "Review", onClick: () => navigate("/drafts") },
        });
        setRecentScrapes((prev) => [...(data.drafts || []), ...prev].slice(0, 24));
      } else {
        toast.success("Added to drafts", {
          description: data.draft.title,
          action: { label: "Review", onClick: () => navigate("/drafts") },
        });
        setRecentScrapes((prev) => [data.draft, ...prev].slice(0, 8));
      }
      setScrapeUrl("");
    } catch (err: any) {
      toast.error(err.message || "Failed to scrape link");
    } finally {
      setScraping(false);
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
      toast.success("Renamed");
    }
  }

  if (authLoading || !isAdmin) return null;

  return (
    <div className="min-h-screen grain">
      <SiteHeader />

      <section className="border-b hairline">
        <div className="container py-12 md:py-16">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-4">⏵ Admin</p>
          <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[0.9]">
            <span className="italic font-light">Settings</span>.
          </h1>
        </div>
      </section>

      <main className="container py-12 max-w-3xl space-y-16">
        {/* Admins */}
        <section>
          <header className="flex items-center gap-3 mb-6">
            <Shield className="h-5 w-5 text-primary" strokeWidth={1.5} />
            <h2 className="font-display text-3xl font-black tracking-tighter">Admin team</h2>
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

        {/* AI Scrape */}
        <section>
          <header className="flex items-center gap-3 mb-2">
            <Sparkles className="h-5 w-5 text-primary" strokeWidth={1.5} />
            <h2 className="font-display text-3xl font-black tracking-tighter">Import via link</h2>
          </header>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-6">
            Paste a YouTube video / playlist, Vimeo, or web page URL. Playlists become one draft per video. AI cleans titles (strips brand & "case study"), infers brand, categories & tags. Saved to drafts for review.
          </p>

          <form onSubmit={handleScrape} className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex-1 space-y-2">
              <Label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                URL
              </Label>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="url"
                  required
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  className="bg-secondary border-0 font-mono pl-9"
                  disabled={scraping}
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={scraping}
              className="font-mono text-xs uppercase tracking-widest h-10 sm:self-end"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              {scraping ? "Scraping…" : "Scrape & draft"}
            </Button>
          </form>

          {recentScrapes.length > 0 && (
            <div className="mt-6">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                Recently added this session
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {recentScrapes.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => navigate("/drafts")}
                    className="text-left group"
                  >
                    <div className="aspect-video bg-secondary overflow-hidden hairline border">
                      {r.thumbnail_url ? (
                        <img
                          src={r.thumbnail_url}
                          alt={r.title}
                          className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <ExternalLink className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <p className="mt-2 font-mono text-[11px] line-clamp-2">{r.title}</p>
                    {r.brand && (
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {r.brand}
                      </p>
                    )}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/drafts")}
                className="mt-4 font-mono text-xs uppercase tracking-widest"
              >
                Review all drafts
              </Button>
            </div>
          )}
        </section>

        {/* Categories */}
        <section>
          <h2 className="font-display text-3xl font-black tracking-tighter mb-6">Categories</h2>

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
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3">
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

export default Settings;
