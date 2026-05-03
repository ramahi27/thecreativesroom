import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ReferenceCard } from "@/components/ReferenceCard";
import { ReferenceDetailModal } from "@/components/ReferenceDetailModal";
import { type Reference } from "@/lib/references";
import { useCategories } from "@/hooks/useCategories";
import { useAuth } from "@/hooks/useAuth";
import { usePageView } from "@/hooks/usePageView";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, Plus, Bookmark, Compass, ArrowUpRight, X, Sparkles, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type MediaFilter = "all" | "videos" | "photos";

const FILTERS_KEY = "archive:filters";
const PAGE_SIZE = 100;

const Index = () => {
  const { isAdmin } = useAuth();
  const { id: openId } = useParams();
  const navigate = useNavigate();
  const [refs, setRefs] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const initial = (() => {
    try {
      const raw = sessionStorage.getItem(FILTERS_KEY);
      if (raw) return JSON.parse(raw) as { mediaFilter: MediaFilter; categoryFilter: string; search: string };
    } catch {}
    return { mediaFilter: "all" as MediaFilter, categoryFilter: "all", search: "" };
  })();

  const [mediaFilter, setMediaFilter] = useState<MediaFilter>(initial.mediaFilter);
  const [categoryFilter, setCategoryFilter] = useState<string>(initial.categoryFilter);
  const [search, setSearch] = useState(initial.search);

  // Brief matching
  const [brief, setBrief] = useState("");
  const [matching, setMatching] = useState(false);
  const [matches, setMatches] = useState<Array<{ ref: Reference; reason: string }>>([]);

  const runBriefMatch = async () => {
    const text = brief.trim();
    if (text.length < 3) {
      toast.error("Write a short brief first.");
      return;
    }
    setMatching(true);
    try {
      const { data, error } = await supabase.functions.invoke("match-brief", {
        body: { brief: text },
      });
      if (error) throw error;
      const list = (data?.matches || []) as Array<{ id: string; reason: string }>;
      if (list.length === 0) {
        toast.info("No strong matches found.");
        setMatches([]);
        return;
      }
      // Fetch full ref data for matched IDs
      const ids = list.map((m) => m.id);
      const { data: rows } = await supabase
        .from("references")
        .select(
          "id,title,type,media_url,source_url,thumbnail_url,brand,agency,year,tags,notes,created_at,updated_at,media_items,categories,published,source"
        )
        .in("id", ids);
      const byId = new Map((rows as unknown as Reference[] | null)?.map((r) => [r.id, r]) ?? []);
      const ordered = list
        .map((m) => {
          const ref = byId.get(m.id);
          return ref ? { ref, reason: m.reason } : null;
        })
        .filter(Boolean) as Array<{ ref: Reference; reason: string }>;
      setMatches(ordered);
      // Scroll to matched section
      setTimeout(() => {
        document.getElementById("matched")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Couldn't match your brief.");
    } finally {
      setMatching(false);
    }
  };

  const clearMatches = () => {
    setMatches([]);
    setBrief("");
  };

  usePageView(openId ? `/ref/${openId}` : "/", openId ?? null);

  useEffect(() => {
    try {
      sessionStorage.setItem(FILTERS_KEY, JSON.stringify({ mediaFilter, categoryFilter, search }));
    } catch {}
  }, [mediaFilter, categoryFilter, search]);

  const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const fetchPage = async (from: number) => {
    const { data, count, error } = await supabase
      .from("references")
      .select(
        "id,title,type,media_url,source_url,thumbnail_url,brand,agency,year,tags,notes,created_at,updated_at,media_items,categories,published,source",
        { count: "exact" }
      )
      .eq("published", true)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { list: [] as Reference[], total: 0 };
    return { list: (data as unknown as Reference[]) || [], total: count ?? 0 };
  };

  useEffect(() => {
    document.title = "The Creatives Room";
    const meta = document.querySelector('meta[name="description"]');
    if (meta)
      meta.setAttribute("content", "A curated archive of ad films, commercials, and visual references for creatives.");

    (async () => {
      const { list, total } = await fetchPage(0);
      setRefs(shuffle(list));
      setTotalCount(total);
      setHasMore(list.length < total);
      setLoading(false);
    })();
  }, []);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const { list, total } = await fetchPage(refs.length);
    setRefs((prev) => {
      const seen = new Set(prev.map((r) => r.id));
      const fresh = list.filter((r) => !seen.has(r.id));
      return [...prev, ...shuffle(fresh)];
    });
    setTotalCount(total);
    setHasMore(refs.length + list.length < total);
    setLoadingMore(false);
  };

  const { video: VIDEO_CATEGORIES, photo: PHOTO_CATEGORIES } = useCategories();

  const availableCategories = useMemo(() => {
    if (mediaFilter === "videos") return VIDEO_CATEGORIES;
    if (mediaFilter === "photos") return PHOTO_CATEGORIES;
    return [...VIDEO_CATEGORIES, ...PHOTO_CATEGORIES];
  }, [mediaFilter, VIDEO_CATEGORIES, PHOTO_CATEGORIES]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return refs.filter((r) => {
      if (mediaFilter === "videos" && !(r.type === "video" || r.type === "link")) return false;
      if (mediaFilter === "photos" && r.type !== "image") return false;
      if (categoryFilter !== "all" && !(r.categories || []).includes(categoryFilter)) return false;
      if (q) {
        const hay = [
          r.title,
          r.brand,
          r.agency,
          r.notes,
          r.year ? String(r.year) : "",
          ...(r.tags || []),
          ...(r.categories || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [refs, mediaFilter, categoryFilter, search]);


  return (
    <div className="min-h-screen grain">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden border-b hairline">
        <div className="container py-20 md:py-32 relative">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-6">⏵ ARCHIVE</p>
          <h1 className="font-display text-6xl md:text-8xl lg:text-9xl font-black leading-[0.85] tracking-tighter max-w-5xl uppercase whitespace-pre-line">
            THE REFERENCE{"\n"}
            <span className="italic font-light">ARCHIVE</span>&nbsp;&nbsp;FOR{"\n"}
            CREATIVES.
          </h1>
          {/* Description removed as requested */}


          {/* Visual triad — what you can do here */}
          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-4">
            <a
              href="#archive"
              className="group relative overflow-hidden border hairline bg-card p-6 flex flex-col justify-between min-h-[180px] transition-colors hover:bg-secondary"
            >
              <div className="flex items-start justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">⏵ 01 / Discover</span>
                <Compass className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="font-display text-3xl font-black tracking-tighter leading-none">
                  Explore the<br />creative world.
                </h3>
                <p className="mt-3 font-body text-sm text-muted-foreground leading-snug">
                  Browse references shared by other creatives, ad films, photography, design.
                </p>
              </div>
              <ArrowUpRight className="absolute bottom-5 right-5 h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
            </a>

            <Link
              to="/mycollection"
              className="group relative overflow-hidden border hairline bg-card p-6 flex flex-col justify-between min-h-[180px] transition-colors hover:bg-secondary"
            >
              <div className="flex items-start justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">⏵ 02 / Save</span>
                <Bookmark className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="font-display text-3xl font-black tracking-tighter leading-none">
                  Build your<br />collection.
                </h3>
                <p className="mt-3 font-body text-sm text-muted-foreground leading-snug">
                  Bookmark anything that sparks an idea and find it later in <span className="italic">My collection</span>.
                </p>
              </div>
              <ArrowUpRight className="absolute bottom-5 right-5 h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
            </Link>

            <Link
              to="/add"
              className="group relative overflow-hidden border hairline bg-card p-6 flex flex-col justify-between min-h-[180px] transition-colors hover:bg-secondary"
            >
              <div className="flex items-start justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">⏵ 03 / Add</span>
                <Plus className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="font-display text-3xl font-black tracking-tighter leading-none">
                  Add your<br />favourite work.
                </h3>
                <p className="mt-3 font-body text-sm text-muted-foreground leading-snug">
                  Drop a film link or upload photo or campaign you love.
                </p>
              </div>
              <ArrowUpRight className="absolute bottom-5 right-5 h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </section>

      {/* Filter bar */}
      <section className="border-b hairline bg-background/80 backdrop-blur-xl">
        <div className="container pt-4 pb-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runBriefMatch();
            }}
            className="flex flex-wrap items-center gap-3"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" strokeWidth={1.5} /> Brief
            </span>
            <div className="relative flex-1 min-w-[240px]">
              <Input
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Describe your brief — e.g. bold youthful sneaker launch, energetic, neon"
                className="pr-9 bg-secondary border-0 font-mono text-xs placeholder:normal-case"
                disabled={matching}
              />
              {brief && !matching && (
                <button
                  type="button"
                  onClick={clearMatches}
                  aria-label="Clear brief"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              )}
            </div>
            <Button
              type="submit"
              disabled={matching}
              className="font-mono text-xs uppercase tracking-widest"
            >
              {matching ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Matching…</> : "Match brief"}
            </Button>
          </form>
        </div>
        <div className="container py-3 flex flex-wrap items-center gap-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Filter</span>
          <Select
            value={mediaFilter}
            onValueChange={(v) => {
              setMediaFilter(v as MediaFilter);
              setCategoryFilter("all");
            }}
          >
            <SelectTrigger className="w-[160px] bg-secondary border-0 font-mono text-xs uppercase tracking-widest">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-mono text-xs uppercase tracking-widest">
                All
              </SelectItem>
              <SelectItem value="videos" className="font-mono text-xs uppercase tracking-widest">
                Videos
              </SelectItem>
              <SelectItem value="photos" className="font-mono text-xs uppercase tracking-widest">
                Photos
              </SelectItem>
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[220px] bg-secondary border-0 font-mono text-xs uppercase tracking-widest">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-mono text-xs uppercase tracking-widest">
                All categories
              </SelectItem>
              {availableCategories.map((c) => (
                <SelectItem key={c} value={c} className="font-mono text-xs uppercase tracking-widest">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[200px] max-w-md ml-auto">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
              strokeWidth={1.5}
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client, brand, tag…"
              className="pl-9 pr-9 bg-secondary border-0 font-mono text-xs uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Grid */}
      <main id="archive" className="container py-12 scroll-mt-20">
        {loading ? (
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading archive…</p>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <p className="font-display text-3xl text-muted-foreground italic">
              {refs.length === 0 ? "The archive is empty." : "Nothing matches."}
            </p>
            {refs.length === 0 && isAdmin && (
              <p className="mt-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Sign in as admin to add the first reference.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filtered.map((r) => (
                <ReferenceCard key={r.id} reference={r} />
              ))}
            </div>
            {hasMore && (
              <div className="mt-12 flex flex-col items-center gap-3">
                <Button
                  variant="outline"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="font-mono text-xs uppercase tracking-widest"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      {openId && <ReferenceDetailModal id={openId} onClose={() => navigate("/")} />}

      <SiteFooter />
      <div className="border-t hairline">
        <div className="container py-4 flex items-center justify-between">
          <p className="uppercase tracking-[0.2em] font-serif text-sm text-muted-foreground"></p>
        </div>
      </div>
    </div>
  );
};

export default Index;
