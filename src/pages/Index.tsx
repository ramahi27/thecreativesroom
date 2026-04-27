import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { ReferenceCard } from "@/components/ReferenceCard";
import { VIDEO_CATEGORIES, PHOTO_CATEGORIES, type Reference } from "@/lib/references";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

type MediaFilter = "all" | "videos" | "photos";

const Index = () => {
  const [refs, setRefs] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    document.title = "THE CREATIVES ROOM — Reference Archive";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "A curated archive of ad films, commercials, and visual references for creatives.");

    (async () => {
      const { data } = await supabase
        .from("references")
        .select("*")
        .eq("published", true)
        .order("created_at", { ascending: false });
      const list = ((data as unknown) as Reference[]) || [];
      // Shuffle so the homepage feels fresh on every visit
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      setRefs(list);
      setLoading(false);
    })();
  }, []);

  const availableCategories = useMemo(() => {
    if (mediaFilter === "videos") return VIDEO_CATEGORIES;
    if (mediaFilter === "photos") return PHOTO_CATEGORIES;
    return [...VIDEO_CATEGORIES, ...PHOTO_CATEGORIES];
  }, [mediaFilter]);

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
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-6">
            ⏵ ARCHIVE
          </p>
          <h1 className="font-display text-6xl md:text-8xl lg:text-9xl font-black leading-[0.85] tracking-tighter max-w-5xl">
            THE<br />
            <span className="italic font-light">CREATIVES</span><br />
            ROOM.
          </h1>
          <p className="mt-8 max-w-xl font-body text-base text-muted-foreground leading-relaxed">
            A personal vault of commercials, promos, photography, and visual references,
            curated for the moments when inspiration runs dry.
          </p>
        </div>
      </section>

      {/* Filter bar */}
      <section className="sticky top-16 z-40 border-b hairline bg-background/80 backdrop-blur-xl">
        <div className="container py-4 flex flex-wrap items-center gap-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            Filter
          </span>
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
              <SelectItem value="all" className="font-mono text-xs uppercase tracking-widest">All</SelectItem>
              <SelectItem value="videos" className="font-mono text-xs uppercase tracking-widest">Videos</SelectItem>
              <SelectItem value="photos" className="font-mono text-xs uppercase tracking-widest">Photos</SelectItem>
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client, brand, tag…"
              className="pl-9 bg-secondary border-0 font-mono text-xs uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal"
            />
          </div>
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
            © THE CREATIVES ROOM — CURATED REFERENCES FOR CREATIVES
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
