import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Reference, MediaItem } from "@/lib/references";
import { detectPlatform, getEmbedUrl, isVideoFile } from "@/lib/references";
import { useCategories } from "@/hooks/useCategories";
import { BookmarkButton } from "@/components/BookmarkButton";
import { ChevronLeft, ChevronRight, ExternalLink, Check, Share2, Flag, Download } from "lucide-react";
import { consumeModalReturn, clearModalReturn, peekModalReturn, getModalNavOrder } from "@/lib/modalReturn";
import { enrichReferenceMetadata } from "@/lib/enrichMetadata";
import { ZoomableImage } from "@/components/ZoomableImage";
import { useJsonLd } from "@/hooks/useJsonLd";
import { PageMeta } from "@/components/PageMeta";
import { refPath } from "@/lib/slug";

interface Props {
  id: string;
  onClose: () => void;
}

export function ReferenceDetailModal({ id, onClose }: Props) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { isPro } = useSubscription();
  const canDownload = isPro || isAdmin;
  const { all: ALL_CATEGORIES } = useCategories();
  const [r, setR] = useState<Reference | null>(null);
  const [allRefs, setAllRefs] = useState<Reference[]>([]);
  const [navOrder] = useState<string[]>(() => getModalNavOrder());
  const [loading, setLoading] = useState(true);
  const [activeMedia, setActiveMedia] = useState(0);
  const [tagInput, setTagInput] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportField, setReportField] = useState("brand");
  const [reportMsg, setReportMsg] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setActiveMedia(0);
    let cancelled = false;
    const cols =
      "id,title,type,media_url,source_url,thumbnail_url,brand,agency,year,tags,tag_synonyms,notes,created_at,updated_at,media_items,categories,published,source";
    // 1) Fetch the single reference first so the modal opens immediately.
    supabase
      .from("references")
      .select(cols)
      .eq("id", id)
      .maybeSingle()
      .then(({ data: one }) => {
        if (cancelled) return;
        setR(one ? (one as unknown as Reference) : null);
        if (one) {
          document.title = `${(one as any).title} — The Creatives Room`;
          // Silently upgrade old /ref/uuid URLs to /ref/uuid-title-slug
          const canonical = refPath((one as any).id, (one as any).title);
          if (window.location.pathname !== canonical) {
            navigate(canonical, { replace: true });
          }
        }
        setLoading(false);
      });
    // 2) Fetch the lighter list in parallel for prev/next + related (no notes/media_items).
    const listCols =
      "id,title,type,media_url,source_url,thumbnail_url,brand,agency,year,tags,categories,published,source,created_at,updated_at";
    supabase
      .from("references")
      .select(listCols)
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data: list }) => {
        if (cancelled) return;
        setAllRefs((list as unknown as Reference[]) || []);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // JSON-LD CreativeWork schema for rich search results
  const jsonLd = useMemo(() => {
    if (!r) return null;
    const creator = r.brand || r.agency;
    const image = r.thumbnail_url || r.media_url || undefined;
    return {
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      name: r.title,
      url: `https://thecreativesroom.com${refPath(r.id, r.title)}`,
      ...(image ? { image } : {}),
      ...(creator ? { creator: { "@type": "Organization", name: creator } } : {}),
      ...(r.brand ? { brand: { "@type": "Brand", name: r.brand } } : {}),
      ...(r.year ? { datePublished: String(r.year) } : {}),
      ...(r.categories?.length ? { genre: r.categories } : {}),
      ...(r.tags?.length ? { keywords: r.tags.join(", ") } : {}),
    };
  }, [r]);
  useJsonLd(jsonLd, "reference-detail");

  // Per-reference social/SEO meta (best-effort: client-rendered)
  const metaDescription = useMemo(() => {
    if (!r) return "";
    const bits = [r.brand, r.agency, r.year ? String(r.year) : null].filter(Boolean);
    const lead = bits.length ? `${bits.join(" · ")}. ` : "";
    const tail = r.notes?.trim() || (r.categories?.length ? r.categories.join(", ") : "") || "Creative reference on The Creatives Room.";
    return `${lead}${tail}`.slice(0, 200);
  }, [r]);

  // Build a similarity-scored ordering across all refs. Used as a fallback
  // for prev/next when the user didn't open the modal from a known list,
  // and as the source for the related-projects strip below.
  const similarityOrdered = useMemo(() => {
    if (!r || allRefs.length === 0) return [] as Reference[];
    const myTags = new Set((r.tags || []).map((t) => t.toLowerCase()));
    const myCats = new Set((r.categories || []).map((c) => c.toLowerCase()));
    const myBrand = (r.brand || "").toLowerCase().trim();
    const myAgency = (r.agency || "").toLowerCase().trim();
    return allRefs
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
      .sort((a, b) => b.score - a.score)
      .map((s) => s.x);
  }, [r, allRefs]);

  const related = useMemo(
    () => similarityOrdered.filter((x) => {
      // Keep the related strip meaningful — only show items with at least
      // some overlap. We re-score quickly here using tag/cat overlap.
      const myTags = new Set((r?.tags || []).map((t) => t.toLowerCase()));
      const myCats = new Set((r?.categories || []).map((c) => c.toLowerCase()));
      const tagOverlap = (x.tags || []).some((t) => myTags.has(t.toLowerCase()));
      const catOverlap = (x.categories || []).some((c) => myCats.has(c.toLowerCase()));
      return tagOverlap || catOverlap;
    }).slice(0, 6),
    [similarityOrdered, r],
  );

  const { prev, next } = useMemo(() => {
    if (!r) return { prev: null as Reference | null, next: null as Reference | null };
    const byId = new Map(allRefs.map((x) => [x.id, x] as const));
    // 1) Prefer the order captured from the page that opened the modal.
    if (navOrder.length > 0) {
      const idx = navOrder.indexOf(r.id);
      if (idx !== -1 && navOrder.length > 1) {
        const prevId = navOrder[(idx - 1 + navOrder.length) % navOrder.length];
        const nextId = navOrder[(idx + 1) % navOrder.length];
        return {
          prev: byId.get(prevId) || null,
          next: byId.get(nextId) || null,
        };
      }
    }
    // 2) Fallback: walk through similar projects.
    if (similarityOrdered.length > 0) {
      return {
        prev: similarityOrdered[similarityOrdered.length - 1] || null,
        next: similarityOrdered[0] || null,
      };
    }
    // 3) Last resort: chronological order from allRefs.
    if (allRefs.length === 0) return { prev: null, next: null };
    const idx = allRefs.findIndex((x) => x.id === r.id);
    if (idx === -1) return { prev: null, next: null };
    return {
      prev: allRefs[(idx - 1 + allRefs.length) % allRefs.length],
      next: allRefs[(idx + 1) % allRefs.length],
    };
  }, [r, allRefs, navOrder, similarityOrdered]);

  const goPrev = useCallback(() => prev && navigate(refPath(prev.id, prev.title)), [prev, navigate]);
  const goNext = useCallback(() => next && navigate(refPath(next.id, next.title)), [next, navigate]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") { goPrev(); return; }
      if (e.key === "ArrowRight") { goNext(); return; }
      if (e.key === " " || e.key === "Enter") {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "SELECT") return;
        e.preventDefault();
        if (iframeRef.current) {
          iframeRef.current.focus();
        } else if (videoRef.current) {
          videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  const returnToOpener = useCallback(() => {
    if (peekModalReturn()) {
      consumeModalReturn(navigate, "/");
    } else {
      onClose();
    }
  }, [navigate, onClose]);

  async function handleDelete() {
    if (!r || !confirm("Delete this reference?")) return;
    const { error } = await supabase.from("references").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    returnToOpener();
  }

  async function handleApprove() {
    if (!r) return;
    const { error } = await supabase.from("references").update({ published: true }).eq("id", r.id);
    if (error) return toast.error(error.message);
    setR({ ...r, published: true } as Reference);
    toast.success("Published — now live on the main page");
    // Backfill missing brand/agency/year using AI in the background.
    enrichReferenceMetadata(r.id);
    returnToOpener();
  }

  async function handleReport(e: React.FormEvent) {
    e.preventDefault();
    if (!r || !reportMsg.trim()) return;
    setReportSending(true);
    const { error } = await supabase.from("reference_reports").insert({
      reference_id: r.id,
      field: reportField,
      message: reportMsg.trim().slice(0, 500),
    });
    setReportSending(false);
    if (error) { toast.error("Couldn't submit report."); return; }
    toast.success("Report submitted — thanks!");
    setReportOpen(false);
    setReportMsg("");
  }

  async function handleShare() {
    if (!r) return;
    const url = `${window.location.origin}${refPath(r.id, r.title)}`;
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

  async function handleDownload() {
    if (!r) return;
    // For embed-only videos (YouTube etc.) open the source URL — can't fetch them directly
    if (currentIsEmbed || !current?.url) {
      const fallback = r.source_url || r.media_url;
      if (fallback) window.open(fallback, "_blank", "noreferrer");
      return;
    }
    const slug = (r.title || "reference").replace(/[^a-z0-9]/gi, "-").toLowerCase().replace(/-+/g, "-");
    try {
      const res = await fetch(current.url, { mode: "cors" });
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const ext = blob.type.split("/")[1]?.split("+")[0] || "jpg";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${slug}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(current.url, "_blank", "noreferrer");
    }
  }

  async function addTag(raw: string) {
    if (!r) return;
    const parts = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const current = Array.isArray(r.tags) ? r.tags : [];
    const lower = new Set(current.map((t) => t.toLowerCase()));
    const additions = parts.filter((t) => !lower.has(t.toLowerCase()));
    if (additions.length === 0) return;
    const nextTags = [...current, ...additions];
    setR({ ...r, tags: nextTags } as Reference);
    const { error } = await supabase.from("references").update({ tags: nextTags }).eq("id", r.id);
    if (error) {
      setR({ ...r, tags: current } as Reference);
      toast.error(error.message);
    }
  }

  async function removeTag(tag: string) {
    if (!r) return;
    const current = Array.isArray(r.tags) ? r.tags : [];
    const nextTags = current.filter((t) => t !== tag);
    setR({ ...r, tags: nextTags } as Reference);
    const { error } = await supabase.from("references").update({ tags: nextTags }).eq("id", r.id);
    if (error) {
      setR({ ...r, tags: current } as Reference);
      toast.error(error.message);
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
    <Dialog open onOpenChange={(o) => !o && returnToOpener()}>
      {r && (
        <PageMeta
          title={`${r.title} — The Creatives Room`}
          description={metaDescription}
          path={refPath(r.id, r.title)}
          ogImage={r.thumbnail_url || r.media_url || undefined}
        />
      )}
      <DialogContent className="max-w-[1600px] w-[96vw] max-h-[95vh] overflow-x-hidden overflow-y-auto p-0 bg-background grain">
        {/* Prev / Next side arrows */}
        {prev && (
          <button
            onClick={goPrev}
            aria-label="Previous reference"
            className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-50 h-12 w-12 flex items-center justify-center bg-background/70 hover:bg-background border hairline backdrop-blur-md transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {next && (
          <button
            onClick={goNext}
            aria-label="Next reference"
            className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-50 h-12 w-12 flex items-center justify-center bg-background/70 hover:bg-background border hairline backdrop-blur-md transition-colors"
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
                ← / → navigate · Space / Enter play
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-10 mt-4">
              <div className="lg:col-span-2 min-w-0">
                <div className="bg-card border hairline overflow-hidden">
                  {currentIsEmbed && embedUrl ? (
                    <div className="aspect-video bg-black">
                      <iframe
                        ref={iframeRef}
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
                        ref={videoRef}
                        src={current.url}
                        controls
                        className="w-full bg-black object-contain max-h-[calc(95vh-16rem)]"
                      />
                    ) : (
                      <div className="aspect-video bg-black">
                        <ZoomableImage src={current.url} alt={r.title} className="h-full" />
                      </div>
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
                        draggable={isAdmin && uploaded.length > 1}
                        onDragStart={(e) => {
                          if (!isAdmin) return;
                          e.dataTransfer.setData("text/plain", String(i));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => {
                          if (isAdmin && uploaded.length > 1) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }
                        }}
                        onDrop={async (e) => {
                          if (!isAdmin || !r) return;
                          e.preventDefault();
                          const from = Number(e.dataTransfer.getData("text/plain"));
                          if (Number.isNaN(from) || from === i) return;
                          const next = [...uploaded];
                          const [moved] = next.splice(from, 1);
                          next.splice(i, 0, moved);
                          const prevR = r;
                          // For photo projects, the first photo is always the thumbnail.
                          const newThumb = r.type === "image"
                            ? (next.find((it) => it.kind === "image")?.url ?? r.thumbnail_url)
                            : r.thumbnail_url;
                          setR({ ...r, media_items: next, thumbnail_url: newThumb } as Reference);
                          setActiveMedia(i);
                          const { error } = await supabase
                            .from("references")
                            .update({ media_items: next as any, thumbnail_url: newThumb })
                            .eq("id", r.id);
                          if (error) {
                            setR(prevR);
                            toast.error(error.message);
                          }
                        }}
                        className={`relative shrink-0 aspect-video w-28 overflow-hidden border hairline ${
                          safeIdx === i ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100"
                        } ${isAdmin && uploaded.length > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
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

                <div className="mt-4 grid grid-cols-1 sm:flex sm:flex-wrap gap-3 [&>*]:justify-center sm:[&>*]:justify-start">
                  {embedUrl && !currentIsEmbed && (
                    <button
                      onClick={() => setActiveMedia(uploaded.length)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-mono text-[11px] uppercase tracking-widest hover:opacity-90"
                    >
                      ▶ Watch here
                    </button>
                  )}
                  {r.source_url && r.type === "video" && (
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
                  {canDownload && (current?.url || r.source_url || r.media_url) && (
                    <button
                      onClick={handleDownload}
                      className="inline-flex items-center gap-2 px-4 py-2 border hairline font-mono text-[11px] uppercase tracking-widest hover:bg-secondary"
                      aria-label="Download"
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </button>
                  )}
                </div>
              </div>

              <aside className="lg:col-span-1 space-y-6">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary mb-3">⏵ {r.type}</p>
                  <h1 className="font-display text-3xl md:text-4xl font-black tracking-tighter leading-[0.95]">
                    {r.title}
                  </h1>
                </div>

                {(() => {
                  const isFilmTv = (r.categories || []).includes("Film and TV scenes");
                  const isMagazine = (r.categories || []).includes("Magazine Covers");
                  return (
                    <dl className="space-y-3 border-t hairline pt-6">
                      {r.brand && <Row label={isFilmTv ? "Title" : "Brand"} value={r.brand} />}
                      {r.agency && !isMagazine && <Row label={isFilmTv ? "Director" : "Agency"} value={r.agency} />}
                      {r.year && <Row label="Year" value={String(r.year)} />}
                    </dl>
                  );
                })()}

                {/* Report a mistake */}
                {!reportOpen ? (
                  <button
                    onClick={() => setReportOpen(true)}
                    className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Flag className="h-3 w-3" />
                    Report a mistake
                  </button>
                ) : (
                  <form onSubmit={handleReport} className="border hairline p-4 space-y-3">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      ⏵ Report a mistake
                    </p>
                    <select
                      value={reportField}
                      onChange={(e) => setReportField(e.target.value)}
                      className="w-full bg-secondary border-0 font-mono text-xs px-3 py-2 focus:outline-none"
                    >
                      <option value="brand">Wrong brand</option>
                      <option value="agency">Wrong agency / director</option>
                      <option value="year">Wrong year</option>
                      <option value="title">Wrong title</option>
                      <option value="category">Wrong category</option>
                      <option value="other">Other</option>
                    </select>
                    <textarea
                      required
                      maxLength={500}
                      rows={3}
                      placeholder="What's correct? e.g. 'Agency should be Droga5, not BBDO'"
                      value={reportMsg}
                      onChange={(e) => setReportMsg(e.target.value)}
                      className="w-full bg-secondary border-0 font-mono text-xs px-3 py-2 resize-none focus:outline-none placeholder:text-muted-foreground"
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={reportSending || !reportMsg.trim()}
                        className="font-mono text-[10px] uppercase tracking-widest px-4 py-2 bg-foreground text-background hover:opacity-80 disabled:opacity-40 transition-opacity"
                      >
                        {reportSending ? "Sending…" : "Submit"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setReportOpen(false); setReportMsg(""); }}
                        className="font-mono text-[10px] uppercase tracking-widest px-4 py-2 border hairline hover:bg-secondary transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

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

                {isAdmin && (
                  <div className="border-t hairline pt-6">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Tags (admin)</p>
                    <div className="flex flex-wrap gap-2">
                      {(r.tags || []).map((t: string) => (
                        <span
                          key={t}
                          className="group inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-widest px-2 py-1 bg-muted text-muted-foreground"
                        >
                          {t}
                          <button
                            onClick={() => removeTag(t)}
                            aria-label={`Remove ${t}`}
                            className="opacity-50 hover:opacity-100 hover:text-destructive"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            addTag(tagInput);
                            setTagInput("");
                          }
                        }}
                        placeholder="Add tag(s), comma-separated"
                        className="flex-1 h-8 px-2 bg-background border hairline font-mono text-[11px] uppercase tracking-widest placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          addTag(tagInput);
                          setTagInput("");
                        }}
                        className="h-8 font-mono text-[10px] uppercase tracking-widest"
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                )}

                {/* Notes hidden from UI but kept in metadata */}

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
                        onClick={() => navigate(refPath(rel.id, rel.title))}
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
