import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Reference, MediaItem } from "@/lib/references";
import { detectPlatform, getEmbedUrl, isVideoFile } from "@/lib/references";
import { useCategories } from "@/hooks/useCategories";
import { BookmarkButton } from "@/components/BookmarkButton";
import { ChevronLeft, ChevronRight, ExternalLink, Check, Share2 } from "lucide-react";

interface Props {
  id: string;
  onClose: () => void;
}

export function ReferenceDetailModal({ id, onClose }: Props) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { all: ALL_CATEGORIES } = useCategories();
  const [r, setR] = useState<Reference | null>(null);
  const [allRefs, setAllRefs] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMedia, setActiveMedia] = useState(0);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setActiveMedia(0);
    (async () => {
      const cols =
        "id,title,type,media_url,source_url,thumbnail_url,brand,agency,year,tags,notes,created_at,updated_at,media_items,categories,published,source";
      const [{ data: one }, { data: list }] = await Promise.all([
        supabase.from("references").select(cols).eq("id", id).maybeSingle(),
        supabase
          .from("references")
          .select(cols)
          .eq("published", true)
          .order("created_at", { ascending: false }),
      ]);
      setR(one ? (one as unknown as Reference) : null);
      setAllRefs((list as unknown as Reference[]) || []);
      if (one) document.title = `${(one as any).title} — The Creatives Room`;
      setLoading(false);
    })();
  }, [id]);

  const { prev, next } = useMemo(() => {
    if (!r || allRefs.length === 0) return { prev: null, next: null };
    const idx = allRefs.findIndex((x) => x.id === r.id);
    if (idx === -1) return { prev: null, next: null };
    return {
      prev: allRefs[(idx - 1 + allRefs.length) % allRefs.length],
      next: allRefs[(idx + 1) % allRefs.length],
    };
  }, [r, allRefs]);

  const goPrev = useCallback(() => prev && navigate(`/ref/${prev.id}`), [prev, navigate]);
  const goNext = useCallback(() => next && navigate(`/ref/${next.id}`), [next, navigate]);

  const related = useMemo(() => {
    if (!r || allRefs.length === 0) return [] as Reference[];
    const myTags = new Set((r.tags || []).map((t) => t.toLowerCase()));
    const myCats = new Set((r.categories || []).map((c) => c.toLowerCase()));
    const myBrand = (r.brand || "").toLowerCase().trim();
    const myAgency = (r.agency || "").toLowerCase().trim();
    const scored = allRefs
      .filter((x) => x.id !== r.id)
      .map((x) => {
        let score = 0;
        const tagOverlap = (x.tags || []).reduce(
          (n, t) => n + (myTags.has(t.toLowerCase()) ? 1 : 0),
          0,
        );
        score += tagOverlap * 3;
        const catOverlap = (x.categories || []).reduce(
          (n, c) => n + (myCats.has(c.toLowerCase()) ? 1 : 0),
          0,
        );
        score += catOverlap * 2;
        if (myBrand && (x.brand || "").toLowerCase().trim() === myBrand) score += 4;
        if (myAgency && (x.agency || "").toLowerCase().trim() === myAgency) score += 2;
        if (x.type === r.type) score += 1;
        return { x, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((s) => s.x);
    return scored;
  }, [r, allRefs]);

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
    // If admin came from the Drafts page, return them there with the same filters/page.
    const returnUrl = sessionStorage.getItem("draftsReturnUrl");
    if (returnUrl) {
      sessionStorage.removeItem("draftsReturnUrl");
      navigate(returnUrl);
      return;
    }
    onClose();
  }

  async function handleApprove() {
    if (!r) return;
    const { error } = await supabase.from("references").update({ published: true }).eq("id", r.id);
    if (error) return toast.error(error.message);
    setR({ ...r, published: true } as Reference);
    toast.success("Published — now live on the main page");
    // If admin came from the Drafts page, return them there with the same filters/page.
    const returnUrl = sessionStorage.getItem("draftsReturnUrl");
    if (returnUrl) {
      sessionStorage.removeItem("draftsReturnUrl");
      navigate(returnUrl);
    }
  }

  async function handleShare() {
    if (!r) return;
    const url = `${window.location.origin}/ref/${r.id}`;
    const shareData = {
      title: r.title,
      text: `${r.title} — on The Creatives Room`,
      url,
    };
    try {
      if (navigator.share && typeof navigator.canShare === "function" ? navigator.canShare(shareData) : !!navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not share link");
    }
  }

  async function toggleCategory(cat: string) {
    if (!r) return;
    const current = r.categories || [];
    const nextCats = current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat];
    setR({ ...r, categories: nextCats } as Reference);
    const { error } = await supabase.from("references").update({ categories: nextCats }).eq("id", r.id);
    if (error) {
      setR({ ...r, categories: current } as Reference);
      toast.error(error.message);
    }
  }

  const platform = r ? detectPlatform(r.source_url) : null;
  const embedUrl = r ? getEmbedUrl(r.source_url) : null;
  const items: MediaItem[] = r && Array.isArray(r.media_items) ? r.media_items : [];
  const fallback: MediaItem[] =
    r && items.length === 0 && r.media_url
      ? [{ url: r.media_url, kind: isVideoFile(r.media_url) ? "video" : "image" }]
      : [];
  const uploaded = items.length ? items : fallback;
  const hasEmbed = !!embedUrl;
  const totalSlides = uploaded.length + (hasEmbed ? 1 : 0);
  const safeIdx = Math.min(activeMedia, Math.max(0, totalSlides - 1));
  const currentIsEmbed = hasEmbed && safeIdx === uploaded.length;
  const current = !currentIsEmbed ? uploaded[safeIdx] : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[1600px] w-[96vw] max-h-[95vh] overflow-y-auto p-0 bg-background grain">
        {/* Prev / Next side arrows */}
        {prev && (
          <button
            onClick={goPrev}
            aria-label="Previous reference"
            className="fixed left-2 md:left-6 top-1/2 -translate-y-1/2 z-50 h-12 w-12 flex items-center justify-center bg-background/70 hover:bg-background border hairline backdrop-blur-md transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {next && (
          <button
            onClick={goNext}
            aria-label="Next reference"
            className="fixed right-2 md:right-6 top-1/2 -translate-y-1/2 z-50 h-12 w-12 flex items-center justify-center bg-background/70 hover:bg-background border hairline backdrop-blur-md transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {loading ? (
          <div className="p-12">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading…</p>
          </div>
        ) : !r ? (
          <div className="p-12">
            <p className="font-display text-3xl italic text-muted-foreground">Not found.</p>
          </div>
        ) : (
          <div className="p-6 md:p-10">
            <div className="flex items-center justify-end">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                ← / → to navigate
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-10 mt-4">
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
                      <video
                        src={current.url}
                        controls
                        className="w-full bg-black object-contain max-h-[calc(95vh-16rem)]"
                      />
                    ) : (
                      <img
                        src={current.url}
                        alt={r.title}
                        className="w-full bg-black object-contain max-h-[calc(95vh-16rem)] mx-auto"
                        style={{ objectFit: "contain" }}
                      />
                    )
                  ) : (
                    <div className="aspect-video flex items-center justify-center bg-secondary">
                      <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                        No preview
                      </span>
                    </div>
                  )}
                </div>

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

                <div className="mt-4 flex flex-wrap gap-3">
                  {embedUrl && !currentIsEmbed && (
                    <button
                      onClick={() => setActiveMedia(uploaded.length)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-mono text-[11px] uppercase tracking-widest hover:opacity-90"
                    >
                      ▶ Watch here
                    </button>
                  )}
                  {r.source_url && (
                    <a
                      href={r.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 border hairline font-mono text-[11px] uppercase tracking-widest hover:bg-secondary"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open on {platform || "source"}
                    </a>
                  )}
                  <BookmarkButton referenceId={r.id} variant="detail" />
                  <button
                    onClick={handleShare}
                    className="inline-flex items-center gap-2 px-4 py-2 border hairline font-mono text-[11px] uppercase tracking-widest hover:bg-secondary"
                    aria-label="Share this reference"
                  >
                    <Share2 className="h-3 w-3" />
                    Share
                  </button>
                </div>
              </div>

              <aside className="lg:col-span-1 space-y-6">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary mb-3">⏵ {r.type}</p>
                  <h1 className="font-display text-3xl md:text-4xl font-black tracking-tighter leading-[0.95]">
                    {r.title}
                  </h1>
                </div>

                <dl className="space-y-3 border-t hairline pt-6">
                  {r.brand && <Row label="Brand" value={r.brand} />}
                  {r.agency && <Row label="Agency" value={r.agency} />}
                  {r.year && <Row label="Year" value={String(r.year)} />}
                </dl>

                {isAdmin ? (
                  <div className="border-t hairline pt-6">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                      Categories <span className="opacity-60">· click to toggle</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {ALL_CATEGORIES.map((c) => {
                        const active = (r.categories || []).includes(c);
                        return (
                          <button
                            key={c}
                            onClick={() => toggleCategory(c)}
                            className={`font-mono text-[11px] uppercase tracking-widest px-2 py-1 border hairline transition-colors ${
                              active
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-transparent text-muted-foreground hover:bg-secondary"
                            }`}
                          >
                            {active ? "✓ " : "+ "}
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  r.categories?.length > 0 && (
                    <div className="border-t hairline pt-6">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                        Categories
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {r.categories.map((c) => (
                          <span
                            key={c}
                            className="font-mono text-[11px] uppercase tracking-widest px-2 py-1 bg-primary/10 text-primary"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                )}

                {r.tags?.length > 0 && (
                  <div className="border-t hairline pt-6">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Tags</p>
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
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Notes</p>
                    <p className="font-body text-sm leading-relaxed whitespace-pre-wrap">{r.notes}</p>
                  </div>
                )}

                {isAdmin && (
                  <div className="border-t hairline pt-6 flex flex-wrap gap-3">
                    {r.published === false && (
                      <Button onClick={handleApprove} className="font-mono text-xs uppercase tracking-widest bg-primary">
                        <Check className="h-3.5 w-3.5 mr-1.5" />
                        Approve & publish
                      </Button>
                    )}
                    {r.published !== false && (
                      <span className="inline-flex items-center px-3 py-1 font-mono text-[10px] uppercase tracking-widest bg-primary/10 text-primary">
                        ✓ Live
                      </span>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => {
                        onClose();
                        navigate(`/edit/${r.id}`);
                      }}
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

            {related.length > 0 && (
              <div className="mt-12 border-t hairline pt-8">
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-4">
                  ⏵ You might also like
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {related.map((rel) => {
                    const thumb = rel.thumbnail_url || (rel.type === "image" ? rel.media_url : null);
                    return (
                      <button
                        key={rel.id}
                        onClick={() => navigate(`/ref/${rel.id}`)}
                        className="group text-left"
                      >
                        <div className="relative aspect-video overflow-hidden bg-secondary border hairline">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={rel.title}
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                                {rel.type}
                              </span>
                            </div>
                          )}
                        </div>
                        <p className="mt-2 font-serif text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                          {rel.title}
                        </p>
                        {(rel.brand || rel.agency) && (
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground line-clamp-1">
                            {rel.brand || rel.agency}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="font-display text-lg">{value}</dd>
    </div>
  );
}
