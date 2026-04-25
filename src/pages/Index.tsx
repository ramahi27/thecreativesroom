import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { ReferenceCard } from "@/components/ReferenceCard";
import type { Reference } from "@/lib/references";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

const Index = () => {
  const [refs, setRefs] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    document.title = "The Ref Room — Reference Archive";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "A curated archive of ad films, commercials, and visual references for creatives.");

    (async () => {
      const { data } = await supabase
        .from("references")
        .select("*")
        .order("created_at", { ascending: false });
      setRefs((data as Reference[]) || []);
      setLoading(false);
    })();
  }, []);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    refs.forEach((r) => r.tags?.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [refs]);

  const filtered = useMemo(() => {
    return refs.filter((r) => {
      if (activeTag && !r.tags?.includes(activeTag)) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          r.title.toLowerCase().includes(q) ||
          r.brand?.toLowerCase().includes(q) ||
          r.agency?.toLowerCase().includes(q) ||
          r.notes?.toLowerCase().includes(q) ||
          r.tags?.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [refs, query, activeTag]);

  return (
    <div className="min-h-screen grain">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden border-b hairline">
        <div className="container py-20 md:py-32 relative">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-6">
            ⏵ Archive · {refs.length} entries
          </p>
          <h1 className="font-display text-6xl md:text-8xl lg:text-9xl font-black leading-[0.85] tracking-tighter max-w-5xl">
            The reference<br />
            <span className="italic font-light">archive</span> for<br />
            commercial film.
          </h1>
          <p className="mt-8 max-w-xl font-body text-base text-muted-foreground leading-relaxed">
            A personal vault of ad films, photography, and visual references —
            curated for the moments when inspiration runs dry.
          </p>
        </div>
      </section>

      {/* Filter bar */}
      <section className="sticky top-16 z-40 border-b hairline bg-background/80 backdrop-blur-xl">
        <div className="container py-4 space-y-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, brand, tag…"
              className="pl-10 bg-secondary border-0 font-mono text-sm"
            />
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <button
                onClick={() => setActiveTag(null)}
                className={`font-mono text-[11px] uppercase tracking-widest transition-colors ${
                  !activeTag ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTag(t === activeTag ? null : t)}
                  className={`font-mono text-[11px] uppercase tracking-widest transition-colors ${
                    activeTag === t ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Grid */}
      <main className="container py-12">
        {loading ? (
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Loading archive…
          </p>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <p className="font-display text-3xl text-muted-foreground italic">
              {refs.length === 0 ? "The archive is empty." : "Nothing matches."}
            </p>
            {refs.length === 0 && (
              <p className="mt-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Sign in as admin to add the first reference.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((r) => (
              <ReferenceCard key={r.id} reference={r} />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t hairline mt-20">
        <div className="container py-8 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            © Reel Archive — Curated references for creatives
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
