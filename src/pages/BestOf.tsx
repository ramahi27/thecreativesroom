import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageMeta } from "@/components/PageMeta";
import { collections, refMatchesFilter, MIN_COLLECTION_REFS } from "@/lib/collections";

// ──────────────────────────────────────────────────
// Hidden-collection state is stored in app_settings
// under key "hidden_collections" as a jsonb array of
// slug strings. The table already exists with proper
// admin-only write RLS and anon read RLS.
// ──────────────────────────────────────────────────

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

// Pull every published reference (minimal columns) so we can count how many
// match each collection's filter client-side. Paginates past Supabase's
// per-request row cap.
async function fetchAllRefsMinimal() {
  const all: Array<{
    tags: string[] | null;
    categories: string[] | null;
    agency: string | null;
    brand: string | null;
    type: string | null;
    year: number | null;
  }> = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("references")
      .select("tags,categories,agency,brand,type,year")
      .eq("published", true)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as any));
    if (data.length < PAGE) break;
  }
  return all;
}

// ──────────────────────────────────────────────────

interface RowProps {
  c: (typeof collections)[number];
  index: number;
  isAdmin: boolean;
  isHidden: boolean;
  refCount: number | undefined;
  onHide: (slug: string) => void;
  onRestore: (slug: string) => void;
}

function CollectionRow({ c, index, isAdmin, isHidden, refCount, onHide, onRestore }: RowProps) {
  const tooFew = refCount !== undefined && refCount < MIN_COLLECTION_REFS;
  return (
    <div className="group flex items-start gap-6 md:gap-10 py-7 md:py-9 border-b hairline -mx-4 md:-mx-8 px-4 md:px-8">
      <span className="font-mono text-xs text-muted-foreground/40 pt-2 shrink-0 w-6 text-right">
        {String(index + 1).padStart(2, "0")}
      </span>
      <Link
        to={`/${c.section}/${c.slug}`}
        className="flex-1 min-w-0 hover:text-primary transition-colors"
      >
        <h2 className={`font-display text-2xl md:text-4xl font-black tracking-tight leading-tight ${(isHidden || tooFew) && isAdmin ? "opacity-40" : ""}`}>
          {c.title}
        </h2>
        <p className="font-body text-sm text-muted-foreground mt-2 max-w-xl leading-relaxed">
          {c.seoDescription}
        </p>
        {isAdmin && (
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/40 mt-1.5">
            {refCount !== undefined ? `${refCount} refs` : "…"}
            {isHidden ? " · hidden" : tooFew ? " · auto-hidden (< 8)" : ""}
          </p>
        )}
      </Link>
      {isAdmin ? (
        <div className="shrink-0 pt-2">
          {isHidden ? (
            <button
              type="button"
              onClick={() => onRestore(c.slug)}
              className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full border hairline hover:border-foreground/40 transition-colors whitespace-nowrap"
            >
              Restore
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onHide(c.slug)}
              className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors whitespace-nowrap"
            >
              Delete
            </button>
          )}
        </div>
      ) : (
        <span className="font-mono text-xs text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all pt-2 shrink-0 hidden sm:block">
          →
        </span>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────

const BestOf = () => {
  const { isAdmin } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [refs, hiddenSlugs] = await Promise.all([
        fetchAllRefsMinimal(),
        loadHiddenSlugs(),
      ]);
      const next: Record<string, number> = {};
      for (const c of collections) {
        next[c.slug] = refs.filter((r) => refMatchesFilter(r, c.filter)).length;
      }
      setCounts(next);
      setHidden(hiddenSlugs);
      setReady(true);
    })();
  }, []);

  const hide = async (slug: string) => {
    if (!window.confirm(`Hide "${collections.find((c) => c.slug === slug)?.title}"? It will return 404 for visitors.`)) return;
    const next = new Set(hidden).add(slug);
    const ok = await saveHiddenSlugs(next);
    if (!ok) { toast.error("Could not save. Check your permissions."); return; }
    setHidden(next);
    toast.success("Page hidden from visitors.");
  };

  const restore = async (slug: string) => {
    const next = new Set(hidden);
    next.delete(slug);
    const ok = await saveHiddenSlugs(next);
    if (!ok) { toast.error("Could not save. Check your permissions."); return; }
    setHidden(next);
    toast.success("Page restored.");
  };

  // Admins see every collection (so they can manage them).
  // Visitors only see collections with enough refs that aren't hidden.
  const isVisible = (slug: string) =>
    isAdmin || (!hidden.has(slug) && (counts[slug] ?? Infinity) >= MIN_COLLECTION_REFS);

  // Before counts load, show all (avoids collapsing the list on first paint);
  // once ready, filter for visitors.
  const list = ready ? collections.filter((c) => isVisible(c.slug)) : collections;
  const bestOf = list.filter((c) => c.section === "best-of");
  const agencies = list.filter((c) => c.section === "agencies");

  return (
    <div className="min-h-screen grain">
      <PageMeta
        title="Best Of The Best & Agencies - The Creatives Room"
        description="Curated collections of the best advertising campaigns by theme and agency — from Cannes Grand Prix winners to Nike, Ogilvy, and Wieden+Kennedy."
        path="/best-of"
      />
      <SiteHeader />

      <section className="border-b hairline">
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
        <div className="mb-14">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/50 mb-2 pt-6">
            Best Of The Best
          </p>
          <div>
            {bestOf.map((c, i) => (
              <CollectionRow
                key={c.slug}
                c={c}
                index={i}
                isAdmin={isAdmin}
                isHidden={hidden.has(c.slug)}
                refCount={ready ? counts[c.slug] : undefined}
                onHide={hide}
                onRestore={restore}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/50 mb-2 pt-6">
            Agencies
          </p>
          <div>
            {agencies.map((c, i) => (
              <CollectionRow
                key={c.slug}
                c={c}
                index={i}
                isAdmin={isAdmin}
                isHidden={hidden.has(c.slug)}
                refCount={ready ? counts[c.slug] : undefined}
                onHide={hide}
                onRestore={restore}
              />
            ))}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default BestOf;
