import { Link } from "react-router-dom";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageMeta } from "@/components/PageMeta";
import { collections } from "@/lib/collections";

const bestOf = collections.filter((c) => c.section === "best-of");
const agencies = collections.filter((c) => c.section === "agencies");

function CollectionCard({ c }: { c: (typeof collections)[number] }) {
  return (
    <Link
      to={`/${c.section}/${c.slug}`}
      className="group flex flex-col gap-3 p-5 rounded-2xl border hairline bg-card hover:border-primary/40 hover:bg-secondary/50 transition-colors"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">
        ⏵ {c.section === "agencies" ? "Agency" : "Best Of"}
      </p>
      <h2 className="font-display text-xl font-black tracking-tight leading-tight group-hover:text-primary transition-colors">
        {c.title}
      </h2>
      <p className="font-body text-sm text-muted-foreground leading-relaxed line-clamp-2">
        {c.seoDescription}
      </p>
    </Link>
  );
}

const BestOf = () => (
  <div className="min-h-screen grain">
    <PageMeta
      title="Best Of & Agencies — The Creatives Room"
      description="Curated collections of the best advertising campaigns by theme and agency — from Cannes Grand Prix winners to Nike, Ogilvy, and Wieden+Kennedy."
      path="/best-of"
    />
    <SiteHeader />

    <section className="border-b hairline">
      <div className="container pt-20 md:pt-32 pb-10 md:pb-14">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-2">⏵ Collections</p>
        <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] mt-4 max-w-3xl">
          Best Of & Agencies
        </h1>
        <p className="font-body text-base text-muted-foreground max-w-xl mt-6">
          Curated archives of the most celebrated advertising — organised by theme, moment, and the agencies behind the work.
        </p>
      </div>
    </section>

    <main className="container py-12 space-y-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground/60 mb-6">Best Of</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {bestOf.map((c) => <CollectionCard key={c.slug} c={c} />)}
        </div>
      </div>

      <div>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground/60 mb-6">Agencies</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agencies.map((c) => <CollectionCard key={c.slug} c={c} />)}
        </div>
      </div>
    </main>

    <SiteFooter />
  </div>
);

export default BestOf;
