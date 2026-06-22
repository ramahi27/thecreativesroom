import { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageMeta } from "@/components/PageMeta";
import { ReferenceCard } from "@/components/ReferenceCard";
import { type Reference } from "@/lib/references";
import { findCollection, collections } from "@/lib/collections";
import NotFound from "@/pages/NotFound";

function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden bg-card border hairline flex flex-col animate-pulse">
      <div className="aspect-video bg-secondary" />
      <div className="p-4 flex flex-col gap-3 flex-1" style={{ minHeight: "7rem" }}>
        <div className="h-5 bg-secondary rounded-md w-3/4" />
        <div className="h-4 bg-secondary rounded-md w-1/2" />
        <div className="h-3 bg-secondary rounded-md w-1/3 mt-auto" />
      </div>
    </div>
  );
}

const CollectionPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const { pathname } = useLocation();
  const section = pathname.startsWith("/agencies/") ? "agencies" : "best-of";
  const collection = slug ? findCollection(section, slug) : undefined;

  const [refs, setRefs] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!collection) return;

    (async () => {
      setLoading(true);
      const { filter } = collection;

      let query = supabase
        .from("references")
        .select(
          "id,title,type,media_url,source_url,thumbnail_url,brand,agency,year,tags,notes,created_at,media_items,categories,published"
        )
        .eq("published", true)
        .order("created_at", { ascending: false })
        .limit(60);

      if (filter.tags && filter.tags.length > 0) {
        query = query.overlaps("tags", filter.tags);
      }
      if (filter.agency) {
        query = query.ilike("agency", `%${filter.agency}%`);
      }
      if (filter.brand) {
        query = query.ilike("brand", `%${filter.brand}%`);
      }
      if (filter.categories && filter.categories.length > 0) {
        query = query.overlaps("categories", filter.categories);
      }
      if (filter.type) {
        query = query.eq("type", filter.type);
      }
      if (filter.yearMin !== undefined) {
        query = query.gte("year", filter.yearMin);
      }
      if (filter.yearMax !== undefined) {
        query = query.lte("year", filter.yearMax);
      }

      const { data } = await query;
      setRefs((data as unknown as Reference[]) || []);
      setLoading(false);
    })();
  }, [collection]);

  if (!collection) return <NotFound />;

  const orderedIds = refs.map((r) => r.id);

  return (
    <div className="min-h-screen grain">
      <PageMeta
        title={collection.seoTitle}
        description={collection.seoDescription}
        path={`/${collection.section}/${collection.slug}`}
      />
      <SiteHeader />

      <section className="relative overflow-hidden border-b hairline">
        <div className="container pt-20 md:pt-32 pb-10 md:pb-14 relative">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-2">
            ⏵ {collection.section === "agencies" ? "Agencies" : "Best Of"}
          </p>
          <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] mt-4 max-w-4xl">
            {collection.title}
          </h1>
          <p className="font-body text-base text-muted-foreground max-w-xl mt-6">
            {collection.seoDescription}
          </p>
          {!loading && (
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground/60 mt-4">
              {refs.length} references
            </p>
          )}
        </div>
      </section>

      {collection.intro && (
        <div className="container py-10 md:py-14 border-b hairline">
          <p className="font-body text-base md:text-lg text-foreground/80 max-w-2xl leading-relaxed">
            {collection.intro}
          </p>
        </div>
      )}

      <main className="container py-12">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : refs.length === 0 ? (
          <div className="py-20 text-center">
            <p className="font-display text-3xl text-muted-foreground italic">
              Nothing here yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {refs.map((r, i) => (
              <div
                key={r.id}
                style={{ animation: "cardIn 0.4s ease both", animationDelay: `${Math.min(i * 40, 500)}ms` }}
              >
                <ReferenceCard reference={r} orderedIds={orderedIds} priority={i < 4} />
              </div>
            ))}
          </div>
        )}
      </main>

      {(collection.closing || collection.related.length > 0) && (
        <section className="border-t hairline">
          <div className="container py-12 md:py-16 space-y-10">
            {collection.closing && (
              <div className="max-w-2xl">
                <p className="font-body text-base text-muted-foreground leading-relaxed">
                  {collection.closing}
                </p>
              </div>
            )}
            {collection.related.length > 0 && (
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground/60 mb-4">
                  Related collections
                </p>
                <div className="flex flex-wrap gap-3">
                  {collection.related.map((relSlug) => {
                    const relSection = collections.find((c) => c.slug === relSlug)?.section;
                    const relTitle = collections.find((c) => c.slug === relSlug)?.title;
                    if (!relSection || !relTitle) return null;
                    return (
                      <a
                        key={relSlug}
                        href={`/${relSection}/${relSlug}`}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border hairline text-sm font-mono hover:border-primary/50 hover:text-primary transition-colors"
                      >
                        {relTitle}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <SiteFooter />
    </div>
  );
};

export default CollectionPage;
