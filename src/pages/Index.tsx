import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { extractId, refPath } from "@/lib/slug";
import { useBookmarks } from "@/hooks/useBookmarks";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BackToTop } from "@/components/BackToTop";
import { ReferenceCard } from "@/components/ReferenceCard";
import { ReferenceDetailModal } from "@/components/ReferenceDetailModal";
import { type Reference } from "@/lib/references";
import { useCategories } from "@/hooks/useCategories";
import { useAuth } from "@/hooks/useAuth";
import { usePageView } from "@/hooks/usePageView";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Bookmark, Compass, ArrowUpRight, X, Sparkles, Loader2, Zap, LayoutGrid, List } from "lucide-react";
import { rememberModalReturn, setModalNavOrder, clearModalNavOrder } from "@/lib/modalReturn";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PageMeta } from "@/components/PageMeta";
import { CyclingPlaceholder } from "@/components/CyclingPlaceholder";

type MediaFilter = "all" | "videos" | "photos";
type SortBy = "default" | "newest" | "oldest" | "campaign_newest" | "campaign_oldest" | "title";

const PAGE_SIZE = 100;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const Index = () => {
  const { user, isAdmin } = useAuth();
  const { id: rawId } = useParams();
  const openId = rawId ? extractId(rawId) : undefined;
  const navigate = useNavigate();
  const [refs, setRefs] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortBy>("default");
  const [search, setSearch] = useState("");
  const [briefFocused, setBriefFocused] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "index">(() => {
    try { return (localStorage.getItem("archive:view") as "grid" | "index") || "grid"; }
    catch { return "grid"; }
  });
  useEffect(() => {
    try { localStorage.setItem("archive:view", viewMode); } catch {}
  }, [viewMode]);

  // Keyboard grid navigation
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const focusedIdxRef = useRef<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const { toggle: toggleBookmark } = useBookmarks();

  // Keep ref in sync so keyboard handlers always read the latest value
  useEffect(() => { focusedIdxRef.current = focusedIdx; }, [focusedIdx]);

  // Smart search: AI expands the query into related terms after a short pause
  const [expandedTerms, setExpandedTerms] = useState<string[]>([]);
  const [searchExpanding, setSearchExpanding] = useState(false);
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
    setExpandedTerms([]);
    const q = search.trim();
    if (q.length < 3) return;
    expandTimerRef.current = setTimeout(async () => {
      setSearchExpanding(true);
      try {
        const { data } = await supabase.functions.invoke("expand-search", { body: { term: q } });
        setExpandedTerms(data?.terms || []);
      } catch {
        // silent — regular keyword search still works
      } finally {
        setSearchExpanding(false);
      }
    }, 600);
    return () => { if (expandTimerRef.current) clearTimeout(expandTimerRef.current); };
  }, [search]);

  // Brief matching
  const [brief, setBrief] = useState("");
  const [matching, setMatching] = useState(false);
  const [matches, setMatches] = useState<Array<{ ref: Reference; reason: string }>>([]);
  const [briefUsage, setBriefUsage] = useState<{ used: number; limit: number; plan: string } | null>(null);

  // Fetch today's usage on load so counter always shows
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    if (!user) {
      // Anon: read from localStorage (written after each use)
      try {
        const stored = JSON.parse(localStorage.getItem("brief_usage_anon") || "{}");
        const used = stored.date === today ? (stored.used ?? 0) : 0;
        setBriefUsage({ used, limit: 1, plan: "anon" });
      } catch {
        setBriefUsage({ used: 0, limit: 1, plan: "anon" });
      }
      return;
    }
    (async () => {
      const [{ data: planData }, { data: usageData }, { data: adminRow }] = await Promise.all([
        supabase.rpc("get_my_plan" as any),
        supabase.from("brief_usages").select("count").eq("user_id", user.id).eq("usage_date", today).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
      ]);
      const plan = adminRow ? "admin" : ((planData as string) || "free");
      const limit = (plan === "paid" || plan === "admin") ? 50 : 3;
      setBriefUsage({ used: usageData?.count ?? 0, limit, plan });
    })();
  }, [user]);

  const runBriefMatch = async (overrideText?: string) => {
    const text = (overrideText ?? brief).trim();
    if (text.length < 3) {
      toast.error("Write a short brief first.");
      return;
    }
    setMatching(true);
    setMediaFilter("all");
    setCategoryFilter("all");
    setSearch("");
    try {
      const { data, error } = await supabase.functions.invoke("match-brief", {
        body: { brief: text },
      });

      // Parse body from FunctionsHttpError (non-2xx responses put body in error.context)
      let payload = data;
      if (!payload && error) {
        try { payload = await (error as any).context?.json?.(); } catch {}
      }

      // Rate limit hit
      const isRateLimit = (error as any)?.context?.status === 429 || payload?.error === "limit_reached";
      if (isRateLimit) {
        const plan: string = payload?.plan ?? "anon";
        if (payload?.used !== undefined) {
          setBriefUsage({ used: payload.used, limit: payload.limit, plan });
          if (plan === "anon") {
            const today = new Date().toISOString().split("T")[0];
            try { localStorage.setItem("brief_usage_anon", JSON.stringify({ date: today, used: payload.used })); } catch {}
          }
        }
        const isAnon = plan === "anon";
        const isFree = plan === "free";
        toast.custom((t) => (
          <div className="w-[360px] rounded-2xl bg-background border hairline shadow-xl p-5 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="h-4 w-4 text-primary" strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-base font-black tracking-tight leading-snug">
                  {isAnon ? "You've used your free match" : isFree ? "Daily limit reached" : "Fair use limit reached"}
                </p>
                <p className="font-body text-sm text-muted-foreground mt-0.5 leading-snug">
                  {isAnon
                    ? "Sign up free to get 3 brief matches every day."
                    : isFree
                    ? "Upgrade to Pro for 50 matches a day."
                    : "You've reached today's fair use limit. Come back tomorrow."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toast.dismiss(t)}
                className="shrink-0 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
            {(isAnon || isFree) && (
              <a
                href={isAnon ? "/auth" : "/pricing"}
                className="w-full text-center rounded-full bg-primary text-primary-foreground font-mono text-[11px] uppercase tracking-widest py-2.5 hover:opacity-90 transition-opacity"
              >
                {isAnon ? "Sign up — it's free" : "Upgrade to Pro"}
              </a>
            )}
          </div>
        ), { duration: 8000 });
        return;
      }

      if (error) throw error;

      // Store usage info returned by the server
      if (data?.used !== undefined) {
        setBriefUsage({ used: data.used, limit: data.limit, plan: data.plan });
        if (data.plan === "anon") {
          const today = new Date().toISOString().split("T")[0];
          try { localStorage.setItem("brief_usage_anon", JSON.stringify({ date: today, used: data.used })); } catch {}
        }
      }

      const list = (data?.matches || []) as Array<{ id: string; reason: string }>;
      if (list.length === 0) {
        toast.info("No strong matches found.");
        setMatches([]);
        return;
      }
      const ids = list.map((m) => m.id);
      const { data: rows } = await supabase
        .from("references")
        .select(
          "id,title,type,media_url,source_url,thumbnail_url,brand,agency,year,tags,tag_synonyms,notes,created_at,updated_at,media_items,categories,published,source"
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

  // Measure grid column count from the DOM
  const getColCount = useCallback(() => {
    const grid = gridRef.current;
    if (!grid || grid.children.length < 2) return 1;
    const firstTop = (grid.children[0] as HTMLElement).getBoundingClientRect().top;
    let cols = 1;
    for (let i = 1; i < grid.children.length; i++) {
      if ((grid.children[i] as HTMLElement).getBoundingClientRect().top !== firstTop) break;
      cols++;
    }
    return cols;
  }, []);

  const fetchPage = async (from: number) => {
    const { data, count, error } = await supabase
      .from("references")
      .select(
        "id,title,type,media_url,source_url,thumbnail_url,brand,agency,year,tags,tag_synonyms,notes,created_at,updated_at,media_items,categories,published,source",
        { count: "exact" }
      )
      .eq("published", true)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { list: [] as Reference[], total: 0 };
    return { list: (data as unknown as Reference[]) || [], total: count ?? 0 };
  };

  useEffect(() => {
    (async () => {
      const { list, total } = await fetchPage(0);
      setRefs(shuffle(list));
      setTotalCount(total);
      setHasMore(list.length < total);
      setLoading(false);
    })();
  }, []);

  const loadMore = async () => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const from = refs.length; // capture before async gap — refs.length in closure is stale after await
    const { list, total } = await fetchPage(from);
    setRefs((prev) => {
      const seen = new Set(prev.map((r) => r.id));
      const fresh = list.filter((r) => !seen.has(r.id));
      return [...prev, ...shuffle(fresh)];
    });
    setTotalCount(total);
    setHasMore(from + list.length < total);
    loadingMoreRef.current = false;
    setLoadingMore(false);
  };

  // When a filter or sort is active, ensure all references are loaded so results are complete
  useEffect(() => {
    const filterActive =
      mediaFilter !== "all" || categoryFilter !== "all" || search.trim().length > 0 || sortBy !== "default";
    if (!filterActive || loading || loadingMore || !hasMore) return;
    loadMore();
    // loadMore updates refs/hasMore which will re-trigger this effect until fully loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaFilter, categoryFilter, search, sortBy, hasMore, loading, loadingMore]);

  const { video: VIDEO_CATEGORIES, photo: PHOTO_CATEGORIES } = useCategories();

  const availableCategories = useMemo(() => {
    if (mediaFilter === "videos") return VIDEO_CATEGORIES;
    if (mediaFilter === "photos") return PHOTO_CATEGORIES;
    return [...VIDEO_CATEGORIES, ...PHOTO_CATEGORIES];
  }, [mediaFilter, VIDEO_CATEGORIES, PHOTO_CATEGORIES]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const exp = expandedTerms.map((t) => t.toLowerCase()).filter((t) => t && t !== q);

    // Cache compiled regexes — hit() is called ~7 fields × N refs per render
    const reCache = new Map<string, RegExp>();
    const getRe = (term: string) => {
      let re = reCache.get(term);
      if (!re) { re = new RegExp(`(^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`); reCache.set(term, re); }
      return re;
    };
    const hit = (field: string, term: string, exact: number, partial: number): number => {
      if (!field || !term) return 0;
      if (getRe(term).test(field)) return exact;
      return field.includes(term) ? partial : 0;
    };

    const getFields = (r: Reference) => ({
      title: (r.title || "").toLowerCase(),
      brand: (r.brand || "").toLowerCase(),
      agency: (r.agency || "").toLowerCase(),
      tags: (r.tags || []).join(" ").toLowerCase(),
      categories: (r.categories || []).join(" ").toLowerCase(),
      syn: ((r as any).tag_synonyms || []).join(" ").toLowerCase(),
      notes: (r.notes || "").toLowerCase(),
    });

    const score = (r: Reference): number => {
      const f = getFields(r);
      let s = 0;
      s += hit(f.title, q, 100, 60);
      s += hit(f.brand, q, 80, 40);
      s += hit(f.agency, q, 50, 25);
      s += hit(f.tags, q, 60, 30);
      s += hit(f.categories, q, 55, 28);
      s += hit(f.syn, q, 35, 18);
      s += hit(f.notes, q, 20, 10);
      for (const t of exp) {
        s += hit(f.title, t, 18, 10);
        s += hit(f.brand, t, 14, 8);
        s += hit(f.tags, t, 12, 7);
        s += hit(f.categories, t, 11, 6);
        s += hit(f.syn, t, 6, 3);
        s += hit(f.notes, t, 4, 2);
      }
      return s;
    };

    const qScore = (r: Reference): number => {
      const f = getFields(r);
      return hit(f.title, q, 100, 60) + hit(f.brand, q, 80, 40) + hit(f.agency, q, 50, 25)
           + hit(f.tags, q, 60, 30) + hit(f.categories, q, 55, 28) + hit(f.syn, q, 35, 18)
           + hit(f.notes, q, 20, 10);
    };

    const list = refs.filter((r) => {
      if (mediaFilter === "videos" && !(r.type === "video" || r.type === "link")) return false;
      if (mediaFilter === "photos" && r.type !== "image") return false;
      if (categoryFilter !== "all" && !(r.categories || []).includes(categoryFilter)) return false;
      if (q) {
        if (qScore(r) > 0) return true; // original query matched — always include
        // Expansion-only: only include when the synonym hits a curated tag/synonym
        // field — prevents generic words like "celebration" matching unrelated titles
        const tagFields = [
          (r.tags || []).join(" ").toLowerCase(),
          ((r as any).tag_synonyms || []).join(" ").toLowerCase(),
          (r.categories || []).join(" ").toLowerCase(),
        ];
        return exp.some((t) => tagFields.some((f) => f.includes(t)));
      }
      return true;
    });

    // When searching with no explicit sort chosen, rank by relevance.
    if (q && sortBy === "default") {
      return [...list].sort((a, b) => score(b) - score(a));
    }

    if (sortBy === "default") return list;
    const sorted = [...list];
    const time = (s?: string | null) => (s ? new Date(s).getTime() : 0);
    switch (sortBy) {
      case "newest":
        sorted.sort((a, b) => time(b.created_at) - time(a.created_at));
        break;
      case "oldest":
        sorted.sort((a, b) => time(a.created_at) - time(b.created_at));
        break;
      case "campaign_newest":
        sorted.sort((a, b) => (b.year || 0) - (a.year || 0));
        break;
      case "campaign_oldest":
        sorted.sort((a, b) => (a.year || 9999) - (b.year || 9999));
        break;
      case "title":
        sorted.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        break;
    }
    return sorted;
  }, [refs, mediaFilter, categoryFilter, search, expandedTerms, sortBy]);

  // Reset focus when the filtered list changes (search / filter applied)
  useEffect(() => { setFocusedIdx(null); }, [filtered]);

  // Keyboard grid navigation — only active when modal is closed
  useEffect(() => {
    if (openId) return;
    const list = filtered;
    if (list.length === 0) return;

    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const p = focusedIdxRef.current;

      if (e.key === "ArrowRight" || e.key === "j") {
        e.preventDefault();
        setFocusedIdx(p === null ? 0 : Math.min(p + 1, list.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "k") {
        e.preventDefault();
        setFocusedIdx(p === null ? 0 : Math.max(p - 1, 0));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const cols = getColCount();
        setFocusedIdx(p === null ? 0 : Math.min(p + cols, list.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const cols = getColCount();
        setFocusedIdx(p === null ? 0 : Math.max(p - cols, 0));
      } else if (e.key === "Enter") {
        // Default to first card if nothing is focused yet
        const idx = p ?? 0;
        if (list[idx]) navigate(refPath(list[idx].id, list[idx].title));
        if (p === null) setFocusedIdx(0);
      } else if (e.key === "b" || e.key === "B") {
        if (p !== null && list[p]) toggleBookmark(list[p].id);
      } else if (e.key === "Escape") {
        setFocusedIdx(null);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, filtered, getColCount, navigate, toggleBookmark]);

  // Scroll focused card into view
  useEffect(() => {
    if (focusedIdx === null || !gridRef.current) return;
    const el = gridRef.current.children[focusedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedIdx]);

  return (
    <div className="min-h-screen grain">
      <PageMeta
        title="The Creatives Room"
        description="A curated archive of ad films, commercials, and photography references for creatives. Search by brief, browse, and save inspiration."
        path="/"
      />
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden border-b hairline">
        <div className="container pt-20 md:pt-32 pb-8 md:pb-12 relative">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-6">⏵ ARCHIVE</p>
          <h1 className="font-display text-6xl md:text-8xl lg:text-9xl font-black leading-[0.85] tracking-tighter max-w-5xl uppercase whitespace-pre-line">
            THE REFERENCE{"\n"}
            <span className="italic font-light">ARCHIVE</span>&nbsp;&nbsp;FOR{"\n"}
            CREATIVES...
          </h1>
          {/* Description removed as requested */}


          {/* Visual quad — what you can do here */}
          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => {
                document.querySelector<HTMLTextAreaElement>('textarea[placeholder^="What do you need"]')?.focus();
                window.scrollTo({ top: window.innerHeight * 0.6, behavior: "smooth" });
              }}
              className="group relative overflow-hidden rounded-2xl border hairline bg-card p-6 flex flex-col justify-between min-h-[180px] transition-all hover:bg-secondary hover:border-foreground/20 text-left"
            >
              <div className="flex items-start justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">⏵ 01 / Search by brief</span>
                <Sparkles className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="font-display text-3xl font-black tracking-tighter leading-none">
                  Tell us what<br />you need.
                </h3>
                <p className="mt-3 font-body text-sm text-muted-foreground leading-snug">
                  Describe your brief and we'll pull the most relevant references from the archive.
                </p>
              </div>
              <ArrowUpRight className="absolute bottom-5 right-5 h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
            </button>

            <a
              href="#archive"
              className="group relative overflow-hidden rounded-2xl border hairline bg-card p-6 flex flex-col justify-between min-h-[180px] transition-all hover:bg-secondary hover:border-foreground/20"
            >
              <div className="flex items-start justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">⏵ 02 / Discover</span>
                <Compass className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" strokeWidth={1.5} />
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
              className="group relative overflow-hidden rounded-2xl border hairline bg-card p-6 flex flex-col justify-between min-h-[180px] transition-all hover:bg-secondary hover:border-foreground/20"
            >
              <div className="flex items-start justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">⏵ 03 / Save</span>
                <Bookmark className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" strokeWidth={1.5} />
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
              className="group relative overflow-hidden rounded-2xl border hairline bg-card p-6 flex flex-col justify-between min-h-[180px] transition-all hover:bg-secondary hover:border-foreground/20"
            >
              <div className="flex items-start justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">⏵ 04 / Add</span>
                <Plus className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="font-display text-3xl font-black tracking-tighter leading-none">
                  Add your<br />favourite work.
                </h3>
                <p className="mt-3 font-body text-sm text-muted-foreground leading-snug">
                  Save references from anywhere, no more lost links or messy folders
                </p>
              </div>
              <ArrowUpRight className="absolute bottom-5 right-5 h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </section>

      {/* Filter bar */}
      <section id="brief-filters" className="border-b hairline bg-background/80 backdrop-blur-xl scroll-mt-0">
        <div className="container pt-5 pb-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runBriefMatch();
            }}
          >
            <div className="flex items-center gap-2 mb-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-1.5 shrink-0">
                <Sparkles className="h-3 w-3" strokeWidth={1.5} /> Brief Match
              </span>
              <span className="hidden sm:inline font-mono text-[9px] text-muted-foreground/50 normal-case tracking-normal">
                — describe your project and we'll surface the closest references
              </span>
            </div>
            <div className="flex flex-wrap items-start gap-3">
              <div className="relative flex-1 min-w-[240px]">
                {briefUsage && briefUsage.used >= briefUsage.limit ? (
                  <div className="rounded-xl border hairline bg-secondary/40 px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-body text-sm font-semibold">
                        {briefUsage.plan === "anon" ? "You've used your 1 free match" : briefUsage.plan === "free" ? "Daily limit reached" : "Fair use limit reached"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {briefUsage.plan === "anon"
                          ? "Sign up free to get 3 matches every day."
                          : briefUsage.plan === "free"
                          ? "Upgrade to Pro for 50 matches a day."
                          : "You've reached today's fair use limit. Come back tomorrow."}
                      </p>
                    </div>
                    {briefUsage.plan !== "paid" && briefUsage.plan !== "admin" && (
                      <a
                        href={briefUsage.plan === "anon" ? "/auth" : "/pricing"}
                        className="shrink-0 rounded-full bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-widest px-4 py-2 hover:opacity-90 transition-opacity"
                      >
                        {briefUsage.plan === "anon" ? "Sign up" : "Go Pro"}
                      </a>
                    )}
                  </div>
                ) : (
                  <>
                    <CyclingPlaceholder active={!briefFocused && !brief.trim()} className="items-start" />
                    <Textarea
                      value={brief}
                      onChange={(e) => setBrief(e.target.value)}
                      onFocus={() => setBriefFocused(true)}
                      onBlur={() => setBriefFocused(false)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          runBriefMatch();
                        }
                      }}
                      rows={3}
                      placeholder=""
                      className="pr-9 rounded-xl bg-secondary/60 border-border font-mono text-sm leading-snug placeholder:normal-case resize-none py-3 focus:bg-background transition-colors"
                      disabled={matching}
                    />
                    {brief && !matching && (
                      <button
                        type="button"
                        onClick={clearMatches}
                        aria-label="Clear brief"
                        className="absolute right-2 top-3 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                    )}
                    {!brief.trim() && !briefFocused && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {[
                          { label: "Luxury fragrance · cinematic", full: "I'm looking for a luxury fragrance commercial with a dark, cinematic, intimate tone" },
                          { label: "Playful soda · bright & fast cuts", full: "A playful soda brand ad with bright colors and fast cuts" },
                          { label: "Emotional car · family story", full: "An emotional car commercial with a father-daughter story" },
                        ].map(({ label, full }) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setBrief(full)}
                            className="font-mono text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full border hairline bg-secondary/40 text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-secondary transition-colors"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="flex flex-col items-start gap-1.5 shrink-0">
                <Button
                  type="submit"
                  disabled={matching || (briefUsage ? briefUsage.used >= briefUsage.limit : false)}
                  className="rounded-full font-mono text-xs uppercase tracking-widest"
                >
                  {matching ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Matching…</> : "Match brief"}
                </Button>
                {briefUsage && briefUsage.plan !== "paid" && briefUsage.plan !== "admin" && (
                  <div className="flex items-center gap-1.5 pl-1">
                    <div className="flex gap-0.5">
                      {Array.from({ length: briefUsage.limit }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-1.5 w-1.5 rounded-full transition-colors ${i < briefUsage.used ? "bg-foreground/50" : "bg-foreground/12"}`}
                        />
                      ))}
                    </div>
                    <span className={`font-mono text-[9px] uppercase tracking-widest ${briefUsage.used >= briefUsage.limit ? "text-destructive" : "text-muted-foreground"}`}>
                      {briefUsage.used}/{briefUsage.limit} today
                    </span>
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>
        <div className="container py-3 flex flex-wrap items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground shrink-0">Filter</span>
          <Select
            value={mediaFilter}
            onValueChange={(v) => {
              setMediaFilter(v as MediaFilter);
              setCategoryFilter("all");
            }}
          >
            <SelectTrigger className="w-[140px] rounded-xl bg-secondary/60 border-border font-mono text-xs uppercase tracking-widest">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-mono text-xs uppercase tracking-widest">All</SelectItem>
              <SelectItem value="videos" className="font-mono text-xs uppercase tracking-widest">Videos</SelectItem>
              <SelectItem value="photos" className="font-mono text-xs uppercase tracking-widest">Photos</SelectItem>
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[200px] rounded-xl bg-secondary/60 border-border font-mono text-xs uppercase tracking-widest">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-mono text-xs uppercase tracking-widest">All categories</SelectItem>
              {availableCategories.map((c) => (
                <SelectItem key={c} value={c} className="font-mono text-xs uppercase tracking-widest">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="w-[190px] rounded-xl bg-secondary/60 border-border font-mono text-xs uppercase tracking-widest">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default" className="font-mono text-xs uppercase tracking-widest">Sort: Default</SelectItem>
              <SelectItem value="newest" className="font-mono text-xs uppercase tracking-widest">Newly added</SelectItem>
              <SelectItem value="oldest" className="font-mono text-xs uppercase tracking-widest">Oldest added</SelectItem>
              <SelectItem value="campaign_newest" className="font-mono text-xs uppercase tracking-widest">Campaign · newest</SelectItem>
              <SelectItem value="campaign_oldest" className="font-mono text-xs uppercase tracking-widest">Campaign · oldest</SelectItem>
              <SelectItem value="title" className="font-mono text-xs uppercase tracking-widest">Title A–Z</SelectItem>
            </SelectContent>
          </Select>

          {(mediaFilter !== "all" || categoryFilter !== "all" || sortBy !== "default" || search.trim() !== "" || brief.trim() !== "") && (
            <button
              type="button"
              onClick={() => {
                setMediaFilter("all");
                setCategoryFilter("all");
                setSortBy("default");
                setSearch("");
                clearMatches();
              }}
              className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors px-3 py-1.5 rounded-full border hairline hover:border-foreground/30"
            >
              <X className="h-3 w-3" strokeWidth={1.5} /> Clear
            </button>
          )}

          <div className="ml-auto flex items-center rounded-full border hairline overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] px-3 py-1.5 transition-colors ${
                viewMode === "grid" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-3 w-3" strokeWidth={1.5} /> Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode("index")}
              aria-label="Index view"
              className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] px-3 py-1.5 transition-colors ${
                viewMode === "index" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="h-3 w-3" strokeWidth={1.5} /> Index
            </button>
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client, brand, tag…"
              className="pl-9 pr-9 rounded-xl bg-secondary/60 border-border font-mono text-xs placeholder:normal-case placeholder:tracking-normal focus:bg-background transition-colors"
            />
            {(search || searchExpanding) && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {searchExpanding && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Matched for your brief */}
      {matches.length > 0 && (
        <section id="matched" className="container pt-12 scroll-mt-20">
          <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" strokeWidth={1.5} /> Matched for your brief
              </p>
              <h2 className="font-display text-3xl md:text-4xl font-black tracking-tighter leading-none">
                {matches.length} hand-picked references.
              </h2>
            </div>
            <Button
              variant="ghost"
              onClick={clearMatches}
              className="font-mono text-xs uppercase tracking-widest"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {(() => {
              const order = matches.map((m) => m.ref.id);
              return matches.map(({ ref, reason }) => (
                <div key={ref.id} className="flex flex-col gap-2">
                  <ReferenceCard reference={ref} orderedIds={order} />
                  <p className="font-mono text-[11px] leading-snug text-muted-foreground italic px-1">
                    ⏵ {reason}
                  </p>
                </div>
              ));
            })()}
          </div>
          <div className="mt-12 border-t hairline" />
        </section>
      )}

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
            {/* Index view column header — like the index at the back of a design annual */}
            {viewMode === "index" && (
              <div className="hidden md:flex items-baseline gap-4 px-3 pb-2 border-b border-foreground/20">
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground w-10 shrink-0">No.</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground flex-1">Title</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground w-40 shrink-0">Brand</span>
                <span className="hidden lg:block font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground w-40 shrink-0">Agency</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground w-16 shrink-0">Type</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground w-12 text-right shrink-0">Year</span>
              </div>
            )}

            <div
              ref={gridRef}
              className={
                viewMode === "grid"
                  ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
                  : "flex flex-col"
              }
            >
              {(() => {
                const order = filtered.map((x) => x.id);
                if (viewMode === "grid") {
                  return filtered.map((r, i) => (
                    <div
                      key={r.id}
                      className={focusedIdx === i ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""}
                    >
                      <ReferenceCard reference={r} orderedIds={order} priority={i < 4} />
                    </div>
                  ));
                }
                // Index / contact-sheet view
                return filtered.map((r, i) => {
                  const isMagazine = (r.categories || []).includes("Magazine Covers");
                  const showAgency = !isMagazine && r.agency;
                  return (
                    <Link
                      key={r.id}
                      to={refPath(r.id, r.title)}
                      onClick={() => {
                        rememberModalReturn();
                        if (order.length > 0) setModalNavOrder(order);
                        else clearModalNavOrder();
                      }}
                      className={`group relative flex items-baseline gap-4 px-3 py-3 border-b hairline transition-colors ${
                        focusedIdx === i ? "bg-secondary" : "hover:bg-secondary/50"
                      }`}
                    >
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70 w-10 shrink-0">
                        {String(i + 1).padStart(3, "0")}
                      </span>
                      <span className="font-display text-lg md:text-xl font-light tracking-tight leading-snug flex-1 min-w-0 truncate group-hover:text-primary transition-colors">
                        {r.title}
                      </span>
                      <span className="hidden md:block font-mono text-[11px] uppercase tracking-widest text-muted-foreground w-40 shrink-0 truncate">
                        {r.brand || "—"}
                      </span>
                      <span className="hidden lg:block font-mono text-[11px] uppercase tracking-widest text-muted-foreground w-40 shrink-0 truncate">
                        {showAgency ? r.agency : "—"}
                      </span>
                      <span className="hidden md:block font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60 w-16 shrink-0">
                        {r.type === "image" ? "Photo" : r.type === "video" ? "Video" : "Link"}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70 w-12 text-right shrink-0">
                        {r.year || "—"}
                      </span>

                      {/* Contact-sheet hover peek */}
                      {(() => {
                        const mediaItems = (r as any).media_items as Array<{ url?: string; kind?: string }> | undefined;
                        const peekSrc = r.type === "image"
                          ? (Array.isArray(mediaItems) ? mediaItems.find((it) => it?.kind === "image")?.url : undefined) || r.media_url || r.thumbnail_url
                          : r.thumbnail_url;
                        if (!peekSrc) return null;
                        return (
                          <span className="pointer-events-none absolute right-28 top-1/2 -translate-y-1/2 z-20 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 hidden lg:block">
                            <img
                              src={peekSrc}
                              alt=""
                              loading="lazy"
                              className="max-h-48 max-w-[240px] w-auto h-auto block rounded-sm border hairline shadow-cinema"
                            />
                          </span>
                        );
                      })()}
                    </Link>
                  );
                });
              })()}
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

      {/* Pro upgrade banner — shown only to free / anon users */}
      {briefUsage && briefUsage.plan !== "paid" && briefUsage.plan !== "admin" && (
        <div className="border-t hairline mt-10">
          <div className="container py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Zap className="h-4.5 w-4.5 text-primary" strokeWidth={1.8} />
              </div>
              <div>
                <p className="font-display text-xl font-black tracking-tight">Go Pro</p>
                <p className="font-body text-sm text-muted-foreground mt-0.5 max-w-sm">
                  Unlimited AI brief matches, unlimited folders, and early access to new features.
                </p>
              </div>
            </div>
            <Link
              to={briefUsage.plan === "anon" ? "/auth?next=/pricing" : "/pricing"}
              className="shrink-0 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest px-5 py-2.5 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              {briefUsage.plan === "anon" ? "Sign up free" : "Upgrade - $7.99/mo"}
              <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
            </Link>
          </div>
        </div>
      )}

      <BackToTop />

      <div className={briefUsage && briefUsage.plan !== "paid" && briefUsage.plan !== "admin" ? "-mt-20" : ""}>
        <SiteFooter />
      </div>
    </div>
  );
};

export default Index;
