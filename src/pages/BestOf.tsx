import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageMeta } from "@/components/PageMeta";
import { collections, refMatchesFilter, MIN_COLLECTION_REFS } from "@/lib/collections";

function CollectionRow({ c, index }: { c: (typeof collections)[number]; index: number }) {
  return (
    <Link
      to={`/${c.section}/${c.slug}`}
      className="group flex items-start gap-6 md:gap-10 py-7 md:py-9 border-b hairline hover:bg-secondary/20 -mx-4 md:-mx-8 px-4 md:px-8 transition-colors"
    >
      <span className="font-mono text-xs text-muted-foreground/40 pt-2 shrink-0 w-6 text-right">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0">
        <h2 className="font-display text-2xl md:text-4xl font-black tracking-tight leading-tight group-hover:text-primary transition-colors">
          {c.title}
        </h2>
        <p className="font-body text-sm text-muted-foreground mt-2 max-w-xl leading-relaxed">
          {c.seoDescription}
        </p>
      </div>
      <span className="font-mono text-xs text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all pt-2 shrink-0 hidden sm:block">
        →
      </span>
    </Link>
  );
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

const BestOf = () => {
  const { isAdmin } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const [refs, hiddenRes] = await Promise.all([
        fetchAllRefsMinimal(),
        (supabase as any).from("hidden_collections").select("slug"),
      ]);
      const next: Record<string, number> = {};
      for (const c of collections) {
        next[c.slug] = refs.filter((r) => refMatchesFilter(r, c.filter)).length;
      }
      setCounts(next);
      setHidden(new Set(((hiddenRes.data as { slug: string }[] | null) || []).map((h) => h.slug)));
      setReady(true);
    })();
  }, []);

  // Admins see everything (so they can manage pages). The public only sees
  // collections that are not hidden and have enough references.
  const isVisible = (slug: string) =>
    isAdmin || (!hidden.has(slug) && (counts[slug] ?? Infinity) >= MIN_COLLECTION_REFS);

  // Before counts load, show all (avoids hiding everything on first paint);
  // after they load, apply the public filter.
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
            {bestOf.map((c, i) => <CollectionRow key={c.slug} c={c} index={i} />)}
          </div>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/50 mb-2 pt-6">
            Agencies
          </p>
          <div>
            {agencies.map((c, i) => <CollectionRow key={c.slug} c={c} index={i} />)}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
};

export default BestOf;
