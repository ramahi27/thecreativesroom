import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageMeta } from "@/components/PageMeta";
import { deriveThumbnail } from "@/lib/references";
import { collections, refMatchesFilter, MIN_COLLECTION_REFS, isSceneRef, collectionExcludesScenes } from "@/lib/collections";

async function loadHiddenSlugs(): Promise<Set<string>> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "hidden_collections")
    .maybeSingle();
  const arr = (data?.value as string[] | null) ?? [];
  return new Set(arr);
}

async function saveHiddenSlugs(slugs: Set<string>): Promise<boolean> {
  const arr = Array.from(slugs);
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "hidden_collections", value: arr }, { onConflict: "key" });
  return !error;
}

type MinimalRef = {
  tags: string[] | null;
  categories: string[] | null;
  agency: string | null;
  brand: string | null;
  type: string | null;
  year: number | null;
  thumbnail_url: string | null;
  source_url: string | null;
  media_url: string | null;
  media_items: Array<{ url?: string; kind?: string }> | null;
};

async function fetchAllRefs(): Promise<MinimalRef[]> {
  const all: MinimalRef[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("references")
      .select("tags,categories,agency,brand,type,year,thumbnail_url,source_url,media_url,media_items")
      .eq("published", true)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as any));
    if (data.length < PAGE) break;
  }
  return all;
}

// Upgrade YouTube 4:3 letterboxed thumbs to true 16:9.
function upgradeYouTubeThumb(url: string): string {
  if (/i\.ytimg\.com\/vi(?:_webp)?\//.test(url)) {
    return url.replace(/\/(?:maxres|hq|sd|mq)?default\.jpg.*$/, "/maxresdefault.jpg");
  }
  return url;
}

function coverFor(r: MinimalRef): string | null {
  const items = Array.isArray(r.media_items) ? r.media_items : [];
  const firstImg = items.find((it) => it?.kind === "image" && it.url)?.url ?? null;
  const raw = r.type === "image"
    ? (firstImg || r.thumbnail_url || r.media_url || null)
    : (r.thumbnail_url || (r.source_url ? deriveThumbnail(r.source_url) : null) || firstImg || null);
  return raw ? upgradeYouTubeThumb(raw) : null;
}

const isYouTubeThumb = (url: string) => url.includes("i.ytimg.com");

// Collapse YouTube maxres/mq variants so the same video isn't used twice.
function coverKey(url: string): string {
  const m = url.match(/i\.ytimg\.com\/vi(?:_webp)?\/([^/]+)\//);
  if (m) return "yt:" + m[1];
  return url.split("?")[0];
}

// ──────────────────────────────────────────────────

interface CardProps {
  c: (typeof collections)[number];
  index: number;
  cover?: string;
  isAdmin: boolean;
  refCount: number | undefined;
  onHide: (slug: string) => void;
}

function CollectionCard({ c, index, cover, isAdmin, refCount, onHide }: CardProps) {
  const [src, setSrc] = useState<string | undefined>(cover);
  const [imgErr, setImgErr] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  useEffect(() => { setSrc(cover); setImgErr(false); setImgLoaded(false); }, [cover]);

  const tooFew = refCount !== undefined && refCount < MIN_COLLECTION_REFS;
  const dimmed = tooFew && isAdmin;
  const showImg = src && !imgErr;

  return (
    <Link
      to={`/${c.section}/${c.slug}`}
      className={`reveal-card group relative flex flex-col rounded-2xl overflow-hidden border hairline bg-card ${dimmed ? "opacity-50" : ""}`}
      style={{ animation: "cardIn 0.4s ease both", animationDelay: `${Math.min(index * 35, 450)}ms` }}
    >
      {/* Cover — native 16:9 so the subject is never cropped */}
      <div className="relative aspect-video overflow-hidden bg-muted">
        {showImg ? (
          <img
            src={src}
            alt={c.title}
            loading="lazy"
            onLoad={(e) => {
              // maxresdefault returns a ~120px gray placeholder when it doesn't
              // exist — downgrade to the always-present 16:9 mqdefault.
              const img = e.currentTarget;
              if (img.naturalWidth <= 121 && src && src.includes("maxresdefault")) {
                setSrc(src.replace("maxresdefault", "mqdefault"));
                return;
              }
              setImgLoaded(true);
            }}
            onError={() => {
              if (src && src.includes("maxresdefault")) {
                setSrc(src.replace("maxresdefault", "mqdefault"));
                return;
              }
              setImgErr(true);
            }}
            className={`absolute inset-0 h-full w-full object-cover object-center transition-all duration-700 group-hover:scale-105 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-secondary via-card to-background">
            <span className="font-display text-6xl font-black text-foreground/[0.07] select-none">
              {c.title.slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}

        {/* Top gradient for badge legibility */}
        <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/55 to-transparent" />

        {/* Index number */}
        <span className="absolute top-2.5 left-3 font-mono text-[10px] text-white/70 tabular-nums drop-shadow">
          {String(index + 1).padStart(2, "0")}
        </span>

        {/* Admin delete */}
        {isAdmin && (
          <div className="absolute top-2.5 right-2.5 z-10">
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); onHide(c.slug); }}
              className="font-mono text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full bg-black/60 border border-destructive/50 text-destructive hover:bg-destructive/20 transition-colors backdrop-blur-sm"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-1.5 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
            {refCount !== undefined ? `${Math.min(refCount, 24)} refs` : "—"}
          </span>
          {isAdmin && tooFew && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">· auto-hidden</span>
          )}
        </div>
        <h2 className="font-display text-lg md:text-xl font-black tracking-tight leading-[1.1] line-clamp-2 group-hover:text-primary transition-colors">
          {c.title}
        </h2>
        <p className="font-body text-[13px] text-muted-foreground line-clamp-2 leading-snug">
          {c.seoDescription}
        </p>
      </div>
    </Link>
  );
}

// ──────────────────────────────────────────────────

const BestOf = () => {
  const { isAdmin } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState<"all" | "best-of" | "agencies">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [refs, hiddenSlugs] = await Promise.all([
        fetchAllRefs(),
        loadHiddenSlugs(),
      ]);
      if (cancelled) return;

      const nextCounts: Record<string, number> = {};
      const candBySlug: Record<string, string[]> = {};

      for (const c of collections) {
        const excl = collectionExcludesScenes(c);
        let count = 0;
        // Prefer full-bleed image refs (no letterboxing), then YouTube (16:9
        // after maxres upgrade), then any other thumbnail.
        const imageC: string[] = [];
        const ytC: string[] = [];
        const otherC: string[] = [];
        for (const r of refs) {
          if (!refMatchesFilter(r, c.filter)) continue;
          if (excl && isSceneRef(r)) continue;
          count++;
          const cv = coverFor(r);
          if (!cv) continue;
          if (isYouTubeThumb(cv)) ytC.push(cv);
          else if (r.type === "image") imageC.push(cv);
          else otherC.push(cv);
        }
        nextCounts[c.slug] = count;
        candBySlug[c.slug] = Array.from(new Set([...imageC, ...ytC, ...otherC])).slice(0, 8);
      }

      // Greedily assign covers — visible public collections get first pick.
      const priority = (slug: string) =>
        !hiddenSlugs.has(slug) && (nextCounts[slug] ?? 0) >= MIN_COLLECTION_REFS ? 0 : 1;
      const ordered = [...collections].sort((a, b) => priority(a.slug) - priority(b.slug));

      const usedKeys = new Set<string>();
      const nextCovers: Record<string, string> = {};
      for (const c of ordered) {
        for (const cand of candBySlug[c.slug] || []) {
          const key = coverKey(cand);
          if (usedKeys.has(key)) continue;
          usedKeys.add(key);
          nextCovers[c.slug] = cand;
          break;
        }
      }

      if (!cancelled) {
        setCounts(nextCounts);
        setHidden(hiddenSlugs);
        setCovers(nextCovers);
        setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const hide = async (slug: string) => {
    const title = collections.find((c) => c.slug === slug)?.title ?? slug;
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    const next = new Set(hidden).add(slug);
    const ok = await saveHiddenSlugs(next);
    if (!ok) { toast.error("Could not save. Check your permissions."); return; }
    setHidden(next);
    toast.success("Collection deleted.");
  };

  // Deleted (hidden) collections are removed for everyone — admins still see
  // under-threshold collections so they know why they're auto-hidden.
  const isVisible = (slug: string) => {
    if (hidden.has(slug)) return false;
    if (isAdmin) return true;
    return (counts[slug] ?? Infinity) >= MIN_COLLECTION_REFS;
  };

  const visibleList = ready ? collections.filter((c) => isVisible(c.slug)) : collections;

  const q = query.trim().toLowerCase();
  const list = visibleList.filter((c) => {
    if (sectionFilter !== "all" && c.section !== sectionFilter) return false;
    if (!q) return true;
    return (
      c.title.toLowerCase().includes(q) ||
      c.seoDescription.toLowerCase().includes(q) ||
      c.headline.toLowerCase().includes(q)
    );
  });
  const bestOf = list.filter((c) => c.section === "best-of");
  const agencies = list.filter((c) => c.section === "agencies");

  const sectionChips: Array<{ key: "all" | "best-of" | "agencies"; label: string }> = [
    { key: "all", label: "All" },
    { key: "best-of", label: "Best Of The Best" },
    { key: "agencies", label: "Agencies" },
  ];

  const renderGrid = (items: typeof collections) => (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
      {items.map((c, i) => (
        <CollectionCard
          key={c.slug}
          c={c}
          index={i}
          cover={covers[c.slug]}
          isAdmin={isAdmin}
          refCount={ready ? counts[c.slug] : undefined}
          onHide={hide}
        />
      ))}
    </div>
  );

  return (
    <div className="min-h-screen grain">
      <PageMeta
        title="Best Of The Best & Agencies - The Creatives Room"
        description="Curated collections of the best advertising campaigns by theme and agency — from Cannes Grand Prix winners to Nike, Ogilvy, and Wieden+Kennedy."
        path="/best-of"
      />
      <SiteHeader />

      <section className="relative overflow-hidden border-b hairline">
        <div
          className="absolute inset-0 -z-10 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 60% 50% at 50% 0%, hsl(18 95% 58% / 0.08), transparent)" }}
        />
        <div className="container pt-20 md:pt-32 pb-10 md:pb-14">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-2">⏵ Collections</p>
          <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] mt-4 max-w-3xl">
            Best Of The Best
          </h1>
          <p className="font-body text-base text-muted-foreground max-w-xl mt-6">
            Curated archives of the most celebrated advertising, organized by theme, moment, and the agencies behind the work.
          </p>
        </div>
      </section>

      <main className="container py-10">
        {/* Filter toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-10 pt-2 sticky top-16 z-30 bg-background/80 backdrop-blur-md -mx-4 px-4 py-3 rounded-b-xl">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter collections…"
            className="w-full sm:max-w-xs rounded-xl bg-secondary/60 border border-border px-4 py-2.5 font-mono text-xs uppercase tracking-widest placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 transition-colors"
          />
          <div className="flex items-center gap-2 overflow-x-auto">
            {sectionChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setSectionFilter(chip.key)}
                className={`font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
                  sectionFilter === chip.key
                    ? "border-primary/60 text-primary bg-primary/10"
                    : "hairline text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
              >
                {chip.label}
              </button>
            ))}
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/40 ml-1 whitespace-nowrap">
              {list.length} {list.length === 1 ? "collection" : "collections"}
            </span>
          </div>
        </div>

        {list.length === 0 ? (
          <div className="py-20 text-center">
            <p className="font-display text-3xl text-muted-foreground italic">No collections match.</p>
          </div>
        ) : (
          <>
            {(sectionFilter === "all" || sectionFilter === "best-of") && bestOf.length > 0 && (
              <div className="mb-16">
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/50 mb-5">
                  Best Of The Best
                </p>
                {renderGrid(bestOf)}
              </div>
            )}

            {(sectionFilter === "all" || sectionFilter === "agencies") && agencies.length > 0 && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/50 mb-5">
                  Agencies
                </p>
                {renderGrid(agencies)}
              </div>
            )}
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
};

export default BestOf;
