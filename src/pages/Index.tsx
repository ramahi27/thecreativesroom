import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { ReferenceCard } from "@/components/ReferenceCard";
import { VIDEO_CATEGORIES, PHOTO_CATEGORIES, type Reference } from "@/lib/references";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type MediaFilter = "all" | "videos" | "photos";

const Index = () => {
  const [refs, setRefs] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  useEffect(() => {
    document.title = "The Ref Room — Reference Archive";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "A curated archive of ad films, commercials, and visual references for creatives.");

    (async () => {
      const { data } = await supabase
        .from("references")
        .select("*")
        .order("created_at", { ascending: false });
      setRefs(((data as unknown) as Reference[]) || []);
      setLoading(false);
    })();
  }, []);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    refs.forEach((r) => r.tags?.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [refs]);

  const availableCategories = useMemo(() => {
    if (mediaFilter === "videos") return VIDEO_CATEGORIES;
    if (mediaFilter === "photos") return PHOTO_CATEGORIES;
    return [...VIDEO_CATEGORIES, ...PHOTO_CATEGORIES];
  }, [mediaFilter]);

  const filtered = useMemo(() => {
    return refs.filter((r) => {
      if (mediaFilter === "videos" && !(r.type === "video" || r.type === "link")) return false;
      if (mediaFilter === "photos" && r.type !== "image") return false;
      if (categoryFilter !== "all" && !(r.categories || []).includes(categoryFilter)) return false;
      return true;
    });
  }, [refs, mediaFilter, categoryFilter]);

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
            creatives.
          </h1>
          <p className="mt-8 max-w-xl font-body text-base text-muted-foreground leading-relaxed">
            A personal vault of commercials, promos, photography, and visual references,
            curated for the moments when inspiration runs dry.
          </p>
        </div>
      </section>

      {/* Filter bar */}
      <section className="sticky top-16 z-40 border-b hairline bg-background/80 backdrop-blur-xl">
        <div className="container py-4 flex items-center gap-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            Filter
          </span>
          <Select value={mediaFilter} onValueChange={(v) => setMediaFilter(v as MediaFilter)}>
            <SelectTrigger className="w-[180px] bg-secondary border-0 font-mono text-xs uppercase tracking-widest">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="font-mono text-xs uppercase tracking-widest">All</SelectItem>
              <SelectItem value="videos" className="font-mono text-xs uppercase tracking-widest">Videos</SelectItem>
              <SelectItem value="photos" className="font-mono text-xs uppercase tracking-widest">Photos</SelectItem>
            </SelectContent>
          </Select>
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
            © The Ref Room — Curated references for creatives
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
