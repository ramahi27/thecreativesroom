import { useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ReferenceCard } from "@/components/ReferenceCard";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import type { Reference } from "@/lib/references";
import { Check, Trash2, Trash, Copy, Sparkles, Link2, ChevronRight } from "lucide-react";
import { CannesLionsScraper } from "@/components/CannesLionsScraper";
import { Link, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enrichReferenceMetadata } from "@/lib/enrichMetadata";

const PAGE_SIZE = 24;

const SOURCE_LABELS: Record<string, string> = {
  all: "All sources",
  deckofbrilliance: "Deck of Brilliance",
  adsoftheworld: "Ads of the World",
  manual: "Manually added",
};

const Drafts = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [drafts, setDrafts] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [page, setPage] = useState(() => {
    const p = parseInt(searchParams.get("page") || "0", 10);
    return Number.isFinite(p) && p >= 0 ? p : 0;
  });
  const [total, setTotal] = useState(0);
  const [sourceFilter, setSourceFilter] = useState<string>(() => searchParams.get("source") || "all");
  const [sources, setSources] = useState<{ value: string; count: number }[]>([]);
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  

  // Keep URL in sync with filters/page so we can return here with the same view.
  useEffect(() => {
    const next = new URLSearchParams();
    if (sourceFilter && sourceFilter !== "all") next.set("source", sourceFilter);
    if (page > 0) next.set("page", String(page));
    setSearchParams(next, { replace: true });
  }, [sourceFilter, page, setSearchParams]);

  // Remember the return URL for when an admin approves a draft from the detail view.
  useEffect(() => {
    const qs = searchParams.toString();
    sessionStorage.setItem("draftsReturnUrl", `/drafts${qs ? `?${qs}` : ""}`);
  }, [searchParams]);



  useEffect(() => {
    document.title = "Drafts — The Creatives Room";
  }, []);

  // Load source list with counts (only drafts)
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data } = await supabase.from("references").select("source").eq("published", false);
      const counts: Record<string, number> = {};
      ((data as { source: string | null }[]) || []).forEach((r) => {
        const k = r.source || "manual";
        counts[k] = (counts[k] || 0) + 1;
      });
      const list = Object.entries(counts)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);
      setSources(list);
    })();
  }, [isAdmin, drafts.length]);

  // Reset to page 0 when filter changes
  useEffect(() => {
    setPage(0);
  }, [sourceFilter]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setLoading(true);
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("references")
        .select("*", { count: "exact" })
        .eq("published", false)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (sourceFilter !== "all") q = q.eq("source", sourceFilter);
      const { data, count } = await q;
      setDrafts((data as unknown as Reference[]) || []);
      setTotal(count || 0);
      setLoading(false);
    })();
  }, [isAdmin, page, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageNumbers = useMemo(() => {
    // Show all page numbers with ellipsis when too many
    const pages: (number | "…")[] = [];
    const window = 2; // pages around current
    const add = (n: number) => {
      if (!pages.includes(n)) pages.push(n);
    };
    if (totalPages <= 12) {
      for (let i = 0; i < totalPages; i++) add(i);
    } else {
      add(0);
      if (page - window > 1) pages.push("…");
      for (let i = Math.max(1, page - window); i <= Math.min(totalPages - 2, page + window); i++) add(i);
      if (page + window < totalPages - 2) pages.push("…");
      add(totalPages - 1);
    }
    return pages;
  }, [totalPages, page]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) {
    return (
      <div className="min-h-screen grain">
        <SiteHeader />
        <main className="container py-12">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Checking permissions…</p>
        </main>
      </div>
    );
  }

  async function handleScrape(e: React.FormEvent) {
    e.preventDefault();
    const url = scrapeUrl.trim();
    if (!url) return;
    setScraping(true);
    const tId = toast.loading("Fetching page…");
    const steps = ["Extracting metadata…", "Finding main image…", "Verifying image…"];
    let stepIdx = 0;
    const stepTimer = setInterval(() => {
      if (stepIdx < steps.length) {
        toast.loading(steps[stepIdx], { id: tId });
        stepIdx++;
      }
    }, 1200);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-link", { body: { url } });
      clearInterval(stepTimer);
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to scrape");
      toast.dismiss(tId);
      if (data.playlist) {
        toast.success(`Playlist imported — ${data.count} drafts created`, {
          description: data.failed_count ? `${data.failed_count} video(s) failed` : "All videos saved as drafts",
        });
      } else if (data.split) {
        toast.success(`Split into ${data.count} projects`, {
          description: "AI detected multiple projects on the page",
        });
      } else if (data.image_warning) {
        toast.warning("Imported — image needs attention", {
          description:
            "Could not auto-detect the main image (the site may load images with JavaScript). Open the draft to paste an image URL or upload a file.",
          duration: 9000,
        });
      } else {
        toast.success("Ready to review", { description: data.draft.title });
      }
      setScrapeUrl("");
      // Refresh drafts list
      setPage(0);
      const { data: refreshed, count } = await supabase
        .from("references")
        .select("*", { count: "exact" })
        .eq("published", false)
        .order("created_at", { ascending: false })
        .range(0, PAGE_SIZE - 1);
      setDrafts((refreshed as unknown as Reference[]) || []);
      setTotal(count || 0);
    } catch (err: any) {
      clearInterval(stepTimer);
      toast.dismiss(tId);
      toast.error(err.message || "Failed to scrape link");
    } finally {
      setScraping(false);
    }
  }

  async function publish(id: string) {
    setBusyId(id);
    const { error } = await supabase.from("references").update({ published: true }).eq("id", id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    setDrafts((d) => d.filter((r) => r.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    toast.success("Published");
    // Backfill missing brand/agency/year from AI in the background.
    enrichReferenceMetadata(id);
  }

  async function remove(id: string) {
    if (!confirm("Delete this draft permanently?")) return;
    setBusyId(id);
    const { error } = await supabase.from("references").delete().eq("id", id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    setDrafts((d) => d.filter((r) => r.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    toast.success("Deleted");
  }

  async function deleteAllOnPage() {
    if (!confirm(`Delete all ${drafts.length} drafts on this page permanently? This cannot be undone.`)) return;
    const ids = drafts.map((d) => d.id);
    const { error } = await supabase.from("references").delete().in("id", ids);
    if (error) return toast.error(error.message);
    setDrafts([]);
    setTotal((t) => Math.max(0, t - ids.length));
    toast.success(`Deleted ${ids.length}`);
  }

  return (
    <div className="min-h-screen grain">
      <SiteHeader />

      <section className="border-b hairline">
        <div className="container py-12">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-4">⏵ DRAFTS · {total} pending</p>
          <h1 className="font-display text-5xl md:text-7xl font-black leading-[0.85] tracking-tighter">
            Review &<br />
            <span className="italic font-light">approve.</span>
          </h1>
          <p className="mt-6 max-w-xl font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Imported references waiting to go live. Publish to add to the main archive, or delete.
          </p>

          {/* Import via link */}
          <div className="mt-8 max-w-2xl border hairline p-5 bg-muted/30">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" strokeWidth={1.5} />
              <h2 className="font-mono text-xs uppercase tracking-widest">Import via link</h2>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-4">
              YouTube (videos/playlists), Vimeo, or any web page. Multi-image campaigns import all images.
            </p>
            <form onSubmit={handleScrape} className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="url"
                  required
                  placeholder="https://..."
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  className="bg-secondary border-0 font-mono pl-9"
                  disabled={scraping}
                />
              </div>
              <Button type="submit" disabled={scraping} className="font-mono text-xs uppercase tracking-widest">
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                {scraping ? "Scraping…" : "Scrape & draft"}
              </Button>
            </form>
          </div>

          {/* Source filter */}
          {sources.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-2 items-center">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mr-2">
                Source:
              </span>
              <button
                onClick={() => setSourceFilter("all")}
                className={`font-mono text-xs uppercase tracking-widest px-3 py-1.5 border hairline transition-colors ${
                  sourceFilter === "all" ? "bg-foreground text-background" : "hover:bg-muted"
                }`}
              >
                All ({sources.reduce((s, x) => s + x.count, 0)})
              </button>
              {sources.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSourceFilter(s.value)}
                  className={`font-mono text-xs uppercase tracking-widest px-3 py-1.5 border hairline transition-colors ${
                    sourceFilter === s.value ? "bg-foreground text-background" : "hover:bg-muted"
                  }`}
                >
                  {SOURCE_LABELS[s.value] || s.value} ({s.count})
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            {drafts.length > 0 && (
              <Button
                onClick={deleteAllOnPage}
                variant="destructive"
                size="sm"
                className="font-mono text-xs uppercase tracking-widest"
              >
                <Trash className="h-3.5 w-3.5 mr-2" /> Delete all on this page
              </Button>
            )}
            <Button
              asChild
              variant="outline"
              size="sm"
              className="font-mono text-xs uppercase tracking-widest"
            >
              <Link to="/drafts/doubletakes">
                <Copy className="h-3.5 w-3.5 mr-2" /> Doubletakes
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <main className="container py-12">
        {loading ? (
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading drafts…</p>
        ) : drafts.length === 0 ? (
          <p className="font-display text-3xl text-muted-foreground italic py-20 text-center">No drafts pending.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {drafts.map((r) => (
                <div key={r.id} className="relative group">
                  <ReferenceCard reference={r} orderedIds={drafts.map((x) => x.id)} />
                  <div className="absolute bottom-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <Button
                      size="icon"
                      variant="default"
                      disabled={busyId === r.id}
                      onClick={(e) => {
                        e.preventDefault();
                        publish(r.id);
                      }}
                      className="h-9 w-9"
                      title="Publish"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="destructive"
                      disabled={busyId === r.id}
                      onClick={(e) => {
                        e.preventDefault();
                        remove(r.id);
                      }}
                      className="h-9 w-9"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-12 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="font-mono text-xs uppercase tracking-widest"
                >
                  ←
                </Button>
                {pageNumbers.map((n, i) =>
                  n === "…" ? (
                    <span key={`e-${i}`} className="font-mono text-xs text-muted-foreground px-2">
                      …
                    </span>
                  ) : (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={`font-mono text-xs uppercase tracking-widest min-w-[36px] h-9 px-2 border hairline transition-colors ${
                        page === n ? "bg-foreground text-background" : "hover:bg-muted"
                      }`}
                    >
                      {n + 1}
                    </button>
                  ),
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="font-mono text-xs uppercase tracking-widest"
                >
                  →
                </Button>
              </div>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
};

export default Drafts;
