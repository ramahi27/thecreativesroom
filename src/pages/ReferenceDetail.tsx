import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Reference, MediaItem } from "@/lib/references";
import { detectPlatform, getEmbedUrl, isVideoFile } from "@/lib/references";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

const ReferenceDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [r, setR] = useState<Reference | null>(null);
  const [allRefs, setAllRefs] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMedia, setActiveMedia] = useState(0);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setActiveMedia(0);
    (async () => {
      const [{ data: one }, { data: list }] = await Promise.all([
        supabase.from("references").select("*").eq("id", id).maybeSingle(),
        supabase.from("references").select("*").order("created_at", { ascending: false }),
      ]);
      setR(one ? ((one as unknown) as Reference) : null);
      setAllRefs(((list as unknown) as Reference[]) || []);
      if (one) document.title = `${(one as any).title} — The Ref Room`;
      setLoading(false);
    })();
  }, [id]);

  const { prev, next } = useMemo(() => {
    if (!r || allRefs.length === 0) return { prev: null, next: null };
    const idx = allRefs.findIndex((x) => x.id === r.id);
    if (idx === -1) return { prev: null, next: null };
    const prev = allRefs[(idx - 1 + allRefs.length) % allRefs.length];
    const next = allRefs[(idx + 1) % allRefs.length];
    return { prev, next };
  }, [r, allRefs]);

  const goPrev = useCallback(() => prev && navigate(`/ref/${prev.id}`), [prev, navigate]);
  const goNext = useCallback(() => next && navigate(`/ref/${next.id}`), [next, navigate]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  async function handleDelete() {
    if (!r || !confirm("Delete this reference?")) return;
    const { error } = await supabase.from("references").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    navigate("/");
  }

  if (loading)
    return (
      <div className="min-h-screen grain">
        <SiteHeader />
      </div>
    );
  if (!r)
    return (
      <div className="min-h-screen grain">
        <SiteHeader />
        <main className="container py-20">
          <p className="font-display text-3xl italic text-muted-foreground">Not found.</p>
        </main>
      </div>
    );

  const platform = detectPlatform(r.source_url);
  const embedUrl = getEmbedUrl(r.source_url);

  // Build the media list: uploaded items first, then external embed if any
  const items: MediaItem[] = Array.isArray(r.media_items) ? r.media_items : [];
  const fallback: MediaItem[] =
    items.length === 0 && r.media_url
      ? [{ url: r.media_url, kind: isVideoFile(r.media_url) ? "video" : "image" }]
      : [];
  const uploaded = items.length ? items : fallback;
  const hasEmbed = !!embedUrl;
  const totalSlides = uploaded.length + (hasEmbed ? 1 : 0);
  const safeIdx = Math.min(activeMedia, Math.max(0, totalSlides - 1));
  const currentIsEmbed = hasEmbed && safeIdx === uploaded.length;
  const current = !currentIsEmbed ? uploaded[safeIdx] : null;

  return (
    <div className="min-h-screen grain">
      <SiteHeader />

      {/* Prev / Next side arrows */}
      {prev && (
        <button
          onClick={goPrev}
          aria-label="Previous reference"
          className="fixed left-2 md:left-6 top-1/2 -translate-y-1/2 z-40 h-12 w-12 flex items-center justify-center bg-background/70 hover:bg-background border hairline backdrop-blur-md transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {next && (
        <button
          onClick={goNext}
          aria-label="Next reference"
          className="fixed right-2 md:right-6 top-1/2 -translate-y-1/2 z-40 h-12 w-12 flex items-center justify-center bg-background/70 hover:bg-background border hairline backdrop-blur-md transition-colors"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      <main className="container py-12 max-w-[1600px]">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            ← Back to archive
          </Link>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            ← / → to navigate
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-10 mt-8">
          <div className="lg:col-span-2">
            <div className="bg-card border hairline overflow-hidden">
              {currentIsEmbed && embedUrl ? (
                <div className="aspect-video bg-black">
                  <iframe
                    src={embedUrl}
                    title={r.title}
                    className="w-full h-full"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : current ? (
                current.kind === "video" ? (
                  <video src={current.url} controls className="w-full aspect-video bg-black object-contain" />
                ) : (
                  <img src={current.url} alt={r.title} className="w-full" />
                )
              ) : (
                <div className="aspect-video flex items-center justify-center bg-secondary">
                  <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    No preview
                  </span>
                </div>
              )}
            </div>

            {/* Thumbnails strip */}
            {totalSlides > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {uploaded.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveMedia(i)}
                    className={`relative shrink-0 aspect-video w-28 overflow-hidden border hairline ${
                      safeIdx === i ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100"
                    }`}
                  >
                    {m.kind === "video" ? (
                      <video src={m.url} className="w-full h-full object-cover" muted />
                    ) : (
                      <img src={m.url} className="w-full h-full object-cover" alt="" />
                    )}
                  </button>
                ))}
                {hasEmbed && (
                  <button
                    onClick={() => setActiveMedia(uploaded.length)}
                    className={`shrink-0 aspect-video w-28 flex items-center justify-center bg-secondary border hairline font-mono text-[10px] uppercase tracking-widest ${
                      currentIsEmbed ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100"
                    }`}
                  >
                    ▶ {platform || "Link"}
                  </button>
                )}
              </div>
            )}

            {r.source_url && (
              <div className="mt-4 flex flex-wrap gap-3">
                {embedUrl && !currentIsEmbed && (
                  <button
                    onClick={() => setActiveMedia(uploaded.length)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-mono text-[11px] uppercase tracking-widest hover:opacity-90"
                  >
                    ▶ Watch here
                  </button>
                )}
                <a
                  href={r.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 border hairline font-mono text-[11px] uppercase tracking-widest hover:bg-secondary"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open on {platform || "source"}
                </a>
              </div>
            )}
          </div>

          <aside className="lg:col-span-1 space-y-6">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary mb-3">
                ⏵ {r.type}
              </p>
              <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter leading-[0.95]">
                {r.title}
              </h1>
            </div>

            <dl className="space-y-3 border-t hairline pt-6">
              {r.brand && <Row label="Brand" value={r.brand} />}
              {r.agency && <Row label="Agency" value={r.agency} />}
              {r.year && <Row label="Year" value={String(r.year)} />}
            </dl>

            {r.categories?.length > 0 && (
              <div className="border-t hairline pt-6">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                  Categories
                </p>
                <div className="flex flex-wrap gap-2">
                  {r.categories.map((c) => (
                    <span key={c} className="font-mono text-[11px] uppercase tracking-widest px-2 py-1 bg-primary/10 text-primary">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {r.tags?.length > 0 && (
              <div className="border-t hairline pt-6">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                  Tags
                </p>
                <div className="flex flex-wrap gap-2">
                  {r.tags.map((t) => (
                    <span key={t} className="font-mono text-xs px-2 py-1 bg-secondary">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {r.notes && (
              <div className="border-t hairline pt-6">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                  Notes
                </p>
                <p className="font-body text-sm leading-relaxed whitespace-pre-wrap">
                  {r.notes}
                </p>
              </div>
            )}

            {isAdmin && (
              <div className="border-t hairline pt-6 flex gap-3">
                <Button
                  onClick={() => navigate(`/edit/${r.id}`)}
                  className="font-mono text-xs uppercase tracking-widest"
                >
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  className="font-mono text-xs uppercase tracking-widest"
                >
                  Delete
                </Button>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="font-display text-lg">{value}</dd>
    </div>
  );
}

export default ReferenceDetail;
