import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Reference, MediaItem } from "@/lib/references";
import { detectPlatform, getEmbedUrl, isVideoFile, safeHref } from "@/lib/references";
import { useCategories } from "@/hooks/useCategories";
import { BookmarkButton } from "@/components/BookmarkButton";
import { ChevronLeft, ChevronRight, ExternalLink, Check, Share2, Flag, Download } from "lucide-react";
import { consumeModalReturn, clearModalReturn, peekModalReturn, getModalNavOrder } from "@/lib/modalReturn";
import { enrichReferenceMetadata } from "@/lib/enrichMetadata";
import { ZoomableImage } from "@/components/ZoomableImage";
import { useJsonLd } from "@/hooks/useJsonLd";
import { PageMeta } from "@/components/PageMeta";
import { refPath } from "@/lib/slug";
import { extractYouTubeId, downloadYouTubeVideo } from "@/lib/youtubeDownload";

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
  const [downloading, setDownloading] = useState(false);
  const [activeMedia, setActiveMedia] = useState(0);
  const [tagInput, setTagInput] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportField, setReportField] = useState("brand");
  const [reportMsg, setReportMsg] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [embedError, setEmbedError] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setActiveMedia(0);
    setEmbedError(false);
    let cancelled = false;
    const cols =
      "id,title,type,media_url,source_url,thumbnail_url,brand,agency,year,tags,tag_synonyms,notes,created_at,updated_at,media_items,categories,published,source";
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
          const canonical = refPath((one as any).id, (one as any).title);
          if (window.location.pathname !== canonical) {
            navigate(canonical, { replace: true });
          }
        }
        setLoading(false);
      });
    const listCols =
      "id,title,type,media_url,source_url,thumbnail_url,brand,agency,year,tags,categories,published,source,created_at,updated_at";
    // If the opener provided an explicit nav order (drafts page, logs, filtered
    // grid, folder, bookmarks…), only fetch the IMMEDIATE prev/next neighbours
    // by id. A huge `.in("id", [...])` list (e.g. /logs with thousands of rows)
    // overflows the request URL and silently returns empty, which used to break
    // arrow navigation for admins on long lists.
    const navIds = getModalNavOrder();
    if (navIds.length > 0) {
      const idx = navIds.indexOf(id);
      const neighbours: string[] = [];
      if (idx !== -1 && navIds.length > 1) {
        neighbours.push(navIds[(idx - 1 + navIds.length) % navIds.length]);
        neighbours.push(navIds[(idx + 1) % navIds.length]);
      }
      if (neighbours.length === 0) {
        setAllRefs([]);
      } else {
        supabase.from("references").select(listCols).in("id", neighbours).then(({ data: list }) => {
          if (cancelled) return;
          setAllRefs((list as unknown as Reference[]) || []);
        });
      }
    } else {
      supabase.from("references").select(listCols).eq("published", true).order("created_at", { ascending: false }).limit(300).then(({ data: list }) => {
        if (cancelled) return;
        setAllRefs((list as unknown as Reference[]) || []);
      });
    }
    return () => { cancelled = true; };
  }, [id]);

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

  const metaDescription = useMemo(() => {
    if (!r) return "";
    const bits = [r.brand, r.agency, r.year ? String(r.year) : null].filter(Boolean);
    const lead = bits.length ? `${bits.join(" · ")}. ` : "";
    const tail = r.notes?.trim() || (r.categories?.length ? r.categories.join(", ") : "") || "Creative reference on The Creatives Room.";
    return `${lead}${tail}`.slice(0, 200);
  }, [r]);

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
        const tagOverlap = (x.tags || []).reduce((n, t) => n + (myTags.has(t.toLowerCase()) ? 1 : 0), 0);
        score += tagOverlap * 3;
        const catOverlap = (x.categories || []).reduce((n, c) => n + (myCats.has(c.toLowerCase()) ? 1 : 0), 0);
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
    if (navOrder.length > 0) {
      const idx = navOrder.indexOf(r.id);
      if (idx !== -1 && navOrder.length > 1) {
        const prevId = navOrder[(idx - 1 + navOrder.length) % navOrder.length];
        const nextId = navOrder[(idx + 1) % navOrder.length];
        return { prev: byId.get(prevId) || null, next: byId.get(nextId) || null };
      }
    }
    if (similarityOrdered.length > 0) {
      return {
        prev: similarityOrdered[similarityOrdered.length - 1] || null,
        next: similarityOrdered[0] || null,
      };
    }
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
      if (e.key === " ") {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "SELECT") return;
        e.preventDefault();
        e.stopPropagation();
        if (videoRef.current) {
          videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
        } else if (iframeRef.current) {
          iframeRef.current.focus();
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

  const advanceOrReturn = useCallback(() => {
    if (next && next.id !== r?.id) {
      navigate(refPath(next.id, next.title));
    } else {
      returnToOpener();
    }
  }, [next, r, navigate, returnToOpener]);

  async function handleDelete() {
    if (!r || !confirm("Delete this reference?")) return;
    const { error } = await supabase.from("references").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    advanceOrReturn();
  }

  async function handleApprove() {
    if (!r) return;
    const wasDraft = !r.published;
    const { error } = await supabase.from("references").update({ published: true }).eq("id", r.id);
    if (error) return toast.error(error.message);
    setR({ ...r, published: true } as Reference);
    toast.success("Published — now live on the main page");
    enrichReferenceMetadata(r.id);
    if (wasDraft) advanceOrReturn();
    else returnToOpener();
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
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }

  async function handleDownload() {
    if (!r) return;
    const slug = (r.title || "reference").replace(/[^a-z0-9]/gi, "-").toLowerCase().replace(/-+/g, "-");

    if (currentIsEmbed || !current?.url) {
      const target = r.source_url || r.media_url || "";
      const ytId = extractYouTubeId(target);
      if (!ytId) {
        if (!target) { toast.error("No source URL available."); return; }
        toast.error("Only YouTube videos can be downloaded.");
        return;
      }
      setDownloading(true);
      const tId = toast.loading("Preparing download…");
      try {
        const blob = await downloadYouTubeVideo(target, (s) => toast.loading(s, { id: tId }));
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${slug}.mp4`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(a.href);
        document.body.removeChild(a);
        toast.success("Download complete", { id: tId });
      } catch (err: any) {
        toast.error(err.message || "Download failed. Please try again.", { id: tId, duration: 6000 });
      } finally {
        setDownloading(false);
      }
      return;
    }

    const url = current.url;
    const rawExt = url.split("?")[0].split(".").pop() || "";
    const ext = rawExt.length <= 4 ? rawExt : "mp4";

    if (url.includes(".supabase.co/storage/")) {
      const a = document.createElement("a");
      a.href = `${url}${url.includes("?") ? "&" : "?"}download=${slug}.${ext}`;
      a.download = `${slug}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const blobExt = blob.type.split("/")[1]?.split("+")[0] || ext || "jpg";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${slug}.${blobExt}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank", "noreferrer");
    }
  }

  async function addTag(raw: string) {
    if (!r) return;
    const parts = raw.split(",").map((t) => t.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const current = Array.isArray(r.tags) ? r.tags : [];
    const lower = new Set(current.map((t) => t.toLowerCase()));
    const additions = parts.filter((t) => !lower.has(t.toLowerCase()));
    if (additions.length === 0) return;
    const nextTags = [...current, ...additions];
    setR({ ...r, tags: nextTags } as Reference);
    const { error } = await supabase.from("references").update({ tags: nextTags }).eq("id", r.id);
    if (error) { setR({ ...r, tags: current } as Reference); toast.error(error.message); }
  }

  async function removeTag(tag: string) {
    if (!r) return;
    const current = Array.isArray(r.tags) ? r.tags : [];
    const nextTags = current.filter((t) => t !== tag);
    setR({ ...r, tags: nextTags } as Reference);
    const { error } = await supabase.from("references").update({ tags: nextTags }).eq("id", r.id);
    if (error) { setR({ ...r, tags: current } as Reference); toast.error(error.message); }
  }

  async function saveField(field: "title" | "brand" | "agency" | "year", value: string) {
    if (!r) return;
    const prev = { ...r };
    let update: Record<string, unknown>;
    if (field === "year") {
      const parsed = value ? parseInt(value, 10) : null;
      update = { year: Number.isNaN(parsed) ? null : parsed };
    } else {
      update = { [field]: value || null };
    }
    setR({ ...r, ...update } as Reference);
    const { error } = await supabase.from("references").update(update as any).eq("id", r.id);
    if (error) { setR(prev as Reference); toast.error(error.message); }
  }

  async function toggleCategory(cat: string) {
    if (!r) return;
    const current = r.categories || [];
    const nextCats = current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat];
    setR({ ...r, categories: nextCats } as Reference);
    const { error } = await supabase.from("references").update({ categories: nextCats }).eq("id", r.id);
    if (error) { setR({ ...r, categories: current } as Reference); toast.error(error.message); }
  }

  const safeSourceUrl = r ? safeHref(r.source_url) : undefined;
  const platform = r ? detectPlatform(safeSourceUrl ?? null) : null;
  const embedUrl = r ? getEmbedUrl(safeSourceUrl ?? null) : null;
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
      <DialogContent
        className="max-w-[1600px] w-[96vw] max-h-[95vh] overflow-x-hidden overflow-y-auto p-0 bg-background grain"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {prev && (
          <button onClick={goPrev} aria-label="Previous reference"
            className="fixed left-4 md:left-8 top-1/2 -translate-y-1/2 z-50 h-10 w-10 flex items-center justify-center rounded-full bg-background/80 hover:bg-background border hairline backdrop-blur-md transition-colors shadow-lg">
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {next && (
          <button onClick={goNext} aria-label="Next reference"
            className="fixed right-4 md:right-8 top-1/2 -translate-y-1/2 z-50 h-10 w-10 flex items-center justify-center rounded-full bg-background/80 hover:bg-background border hairline backdrop-blur-md transition-colors shadow-lg">
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {loading ? (
          <div className="p-12"><p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading…</p></div>
        ) : !r ? (
          <div className="p-12"><p className="font-display text-3xl italic text-muted-foreground">Not found.</p></div>
        ) : (
          <div className="p-6 md:p-10">
            <div className="flex items-center justify-end">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">← / → navigate</p>
            </div>

            <div className="grid lg:grid-cols-3 gap-10 mt-4">
              <div className="lg:col-span-2 min-w-0">
                <div className="rounded-2xl bg-card border hairline overflow-hidden">
                  {currentIsEmbed && embedUrl ? (
                    <div className="aspect-video bg-black relative">
                      {embedError ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-secondary/60">
                          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Video unavailable</p>
                          {safeSourceUrl && (
                            <a href={safeSourceUrl} target="_blank" rel="noreferrer"
                              className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-widest hover:opacity-90 transition-opacity">
                              <ExternalLink className="h-3 w-3" />
                              Watch on {platform || "source"}
                            </a>
                          )}
                        </div>
                      ) : (
                        <iframe ref={iframeRef} src={embedUrl} title={r.title}
                          className="w-full h-full" allow="autoplay; fullscreen; picture-in-picture"
                          allowFullScreen onError={() => setEmbedError(true)} />
                      )}
                    </div>
                  ) : current ? (
                    current.kind === "video" ? (
                      <video ref={videoRef} src={current.url} controls
                        className="w-full bg-black object-contain max-h-[calc(95vh-16rem)]" />
                    ) : (
                      <div className="aspect-video bg-black">
                        <ZoomableImage src={current.url} alt={r.title} className="h-full" />
                      </div>
                    )
                  ) : (
                    <div className="aspect-video flex items-center justify-center bg-secondary">
                      <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">No preview</span>
                    </div>
                  )}
                </div>

                {totalSlides > 1 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {uploaded.map((m, i) => (
                      <button key={i} onClick={() => setActiveMedia(i)}
                        draggable={isAdmin && uploaded.length > 1}
                        onDragStart={(e) => {
                          if (!isAdmin) return;
                          e.dataTransfer.setData("text/plain", String(i));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => {
                          if (isAdmin && uploaded.length > 1) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
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
                          const newThumb = r.type === "image"
                            ? (next.find((it) => it.kind === "image")?.url ?? r.thumbnail_url)
                            : r.thumbnail_url;
                          setR({ ...r, media_items: next, thumbnail_url: newThumb } as Reference);
                          setActiveMedia(i);
                          const { error } = await supabase.from("references")
                            .update({ media_items: next as any, thumbnail_url: newThumb }).eq("id", r.id);
                          if (error) { setR(prevR); toast.error(error.message); }
                        }}
                        className={`relative shrink-0 aspect-video w-28 rounded-xl overflow-hidden border hairline ${
                          safeIdx === i ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100"
                        } ${isAdmin && uploaded.length > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
                      >
                        {m.kind === "video" ? (
                          <video src={m.url} className="w-full h-full object-cover" muted />
                        ) : (
                          <img src={m.url} className="w-full h-full object-cover" alt="" />
                        )}
                        {isAdmin && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!r) return;
                              const next = uploaded.filter((_, idx) => idx !== i);
                              const prevR = r;
                              const newThumb = r.type === "image"
                                ? (next.find((it) => it.kind === "image")?.url ?? null)
                                : r.thumbnail_url;
                              setR({ ...r, media_items: next, thumbnail_url: newThumb } as Reference);
                              if (safeIdx >= next.length) setActiveMedia(Math.max(0, next.length - 1));
                              const { error } = await supabase.from("references")
                                .update({ media_items: next as any, thumbnail_url: newThumb }).eq("id", r.id);
                              if (error) { setR(prevR); toast.error(error.message); }
                            }}
                            className="absolute top-1 right-1 z-10 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center text-xs leading-none hover:bg-destructive transition-colors"
                            aria-label="Remove photo"
                          >×</button>
                        )}
                      </button>
                    ))}
                    {hasEmbed && (
                      <button onClick={() => setActiveMedia(uploaded.length)}
                        className={`shrink-0 aspect-video w-28 rounded-xl flex items-center justify-center bg-secondary border hairline font-mono text-[10px] uppercase tracking-widest ${
                          currentIsEmbed ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100"
                        }`}>
                        ▶ {platform || "Link"}
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 sm:flex sm:flex-wrap gap-3 [&>*]:justify-center sm:[&>*]:justify-start">
                  {embedUrl && !currentIsEmbed && (
                    <button onClick={() => setActiveMedia(uploaded.length)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground font-mono text-[11px] uppercase tracking-widest hover:opacity-90 transition-opacity">
                      ▶ Watch here
                    </button>
                  )}
                  {safeSourceUrl && r.type === "video" && (
                    <a href={safeSourceUrl} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full border hairline font-mono text-[11px] uppercase tracking-widest hover:bg-secondary transition-colors">
                      <ExternalLink className="h-3 w-3" />
                      Open on {platform || "source"}
                    </a>
                  )}
                  <BookmarkButton referenceId={r.id} variant="detail" />
                  <button onClick={handleShare}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border hairline font-mono text-[11px] uppercase tracking-widest hover:bg-secondary transition-colors"
                    aria-label="Share this reference">
                    <Share2 className="h-3 w-3" />
                    Share
                  </button>
                  {canDownload && (current?.url || r.source_url || r.media_url) && (
                    <button onClick={handleDownload} disabled={downloading}
                      className="inline-flex items-center gap-2 px-4 py-2 border hairline font-mono text-[11px] uppercase tracking-widest hover:bg-secondary disabled:opacity-50 disabled:cursor-wait"
                      aria-label="Download">
                      <Download className={`h-3 w-3 ${downloading ? "animate-pulse" : ""}`} />
                      {downloading ? "Downloading…" : "Download"}
                    </button>
                  )}
                </div>
              </div>

              <aside className="lg:col-span-1 space-y-6">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary mb-3">⏵ {r.type}</p>
                  {isAdmin ? (
                    <>
                      <InlineEdit
                        value={r.title || ""}
                        placeholder="Untitled"
                        onSave={(v) => saveField("title", v)}
                        className="font-display text-3xl md:text-4xl font-black tracking-tighter leading-[0.95]"
                      />
                      {r.brand && r.title?.toLowerCase().startsWith(r.brand.toLowerCase()) && (() => {
                        const stripped = r.title.slice(r.brand.length).replace(/^[\s:–—\-,|]+/, "").trim();
                        if (!stripped) return null;
                        return (
                          <button
                            onClick={() => saveField("title", stripped)}
                            className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-destructive transition-colors"
                          >
                            ✕ Remove "{r.brand}" from title
                          </button>
                        );
                      })()}
                    </>
                  ) : (
                    <h1 className="font-display text-3xl md:text-4xl font-black tracking-tighter leading-[0.95]">
                      {r.title}
                    </h1>
                  )}
                </div>

                {(() => {
                  const isFilmTv = (r.categories || []).includes("Film and TV scenes");
                  const isMagazine = (r.categories || []).includes("Magazine Covers");
                  if (isAdmin) {
                    return (
                      <dl className="space-y-3 border-t hairline pt-6">
                        <AdminRow label={isFilmTv ? "Title" : "Brand"} value={r.brand || ""} placeholder="Add brand…" onSave={(v) => saveField("brand", v)} />
                        {!isMagazine && <AdminRow label={isFilmTv ? "Director" : "Agency"} value={r.agency || ""} placeholder="Add agency…" onSave={(v) => saveField("agency", v)} />}
                        <AdminRow label="Year" value={r.year ? String(r.year) : ""} placeholder="Add year…" onSave={(v) => saveField("year", v)} inputType="number" />
                      </dl>
                    );
                  }
                  return (
                    <dl className="space-y-3 border-t hairline pt-6">
                      {r.brand && <Row label={isFilmTv ? "Title" : "Brand"} value={r.brand} />}
                      {r.agency && !isMagazine && <Row label={isFilmTv ? "Director" : "Agency"} value={r.agency} />}
                      {r.year && <Row label="Year" value={String(r.year)} />}
                    </dl>
                  );
                })()}

                {!reportOpen ? (
                  <button onClick={() => setReportOpen(true)}
                    className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
                    <Flag className="h-3 w-3" />
                    Report a mistake
                  </button>
                ) : (
                  <form onSubmit={handleReport} className="rounded-2xl border hairline p-4 space-y-3">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">⏵ Report a mistake</p>
                    <select value={reportField} onChange={(e) => setReportField(e.target.value)}
                      className="w-full rounded-xl bg-secondary/60 border border-border font-mono text-xs px-3 py-2 focus:outline-none">
                      <option value="brand">Wrong brand</option>
                      <option value="agency">Wrong agency / director</option>
                      <option value="year">Wrong year</option>
                      <option value="title">Wrong title</option>
                      <option value="category">Wrong category</option>
                      <option value="other">Other</option>
                    </select>
                    <textarea required maxLength={500} rows={3}
                      placeholder="What's correct? e.g. 'Agency should be Droga5, not BBDO'"
                      value={reportMsg} onChange={(e) => setReportMsg(e.target.value)}
                      className="w-full rounded-xl bg-secondary/60 border border-border font-mono text-xs px-3 py-2 resize-none focus:outline-none placeholder:text-muted-foreground" />
                    <div className="flex gap-2">
                      <button type="submit" disabled={reportSending || !reportMsg.trim()}
                        className="font-mono text-[10px] uppercase tracking-widest px-4 py-2 rounded-full bg-foreground text-background hover:opacity-80 disabled:opacity-40 transition-opacity">
                        {reportSending ? "Sending…" : "Submit"}
                      </button>
                      <button type="button" onClick={() => { setReportOpen(false); setReportMsg(""); }}
                        className="font-mono text-[10px] uppercase tracking-widest px-4 py-2 rounded-full border hairline hover:bg-secondary transition-colors">
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
                          <button key={c} onClick={() => toggleCategory(c)}
                            className={`font-mono text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-full border hairline transition-colors ${
                              active ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground hover:bg-secondary"
                            }`}>
                            {active ? "✓ " : "+ "}{c}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  r.categories?.length > 0 && (
                    <div className="border-t hairline pt-6">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Categories</p>
                      <div className="flex flex-wrap gap-2">
                        {r.categories.map((c) => (
                          <span key={c} className="font-mono text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-full bg-primary/10 text-primary">{c}</span>
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
                        <span key={t} className="group inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-widest px-2.5 py-1 rounded-full bg-secondary text-muted-foreground">
                          {t}
                          <button onClick={() => removeTag(t)} aria-label={`Remove ${t}`}
                            className="opacity-50 hover:opacity-100 hover:text-destructive">×</button>
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); setTagInput(""); }
                        }}
                        placeholder="Add tag(s), comma-separated"
                        className="flex-1 h-8 px-3 rounded-xl bg-secondary/60 border border-border font-mono text-[11px] uppercase tracking-widest placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary" />
                      <Button type="button" variant="outline" onClick={() => { addTag(tagInput); setTagInput(""); }}
                        className="h-8 rounded-full font-mono text-[10px] uppercase tracking-widest">Add</Button>
                    </div>
                  </div>
                )}

                {isAdmin && (
                  <div className="border-t hairline pt-6 flex flex-wrap gap-3">
                    {r.published === false && (
                      <Button onClick={handleApprove} className="rounded-full font-mono text-xs uppercase tracking-widest bg-primary">
                        <Check className="h-3.5 w-3.5 mr-1.5" />
                        Approve & publish
                      </Button>
                    )}
                    {r.published !== false && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full font-mono text-[10px] uppercase tracking-widest bg-primary/10 text-primary">✓ Live</span>
                    )}
                    <Button variant="outline" onClick={() => navigate(`/edit/${r.id}`)}
                      className="rounded-full font-mono text-xs uppercase tracking-widest">Edit</Button>
                    <Button variant="destructive" onClick={handleDelete}
                      className="rounded-full font-mono text-xs uppercase tracking-widest">Delete</Button>
                  </div>
                )}
              </aside>
            </div>

            {related.length > 0 && (
              <div className="mt-12 border-t hairline pt-8">
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-4">⏵ You might also like</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {related.map((rel) => {
                    const thumb = rel.thumbnail_url || (rel.type === "image" ? rel.media_url : null);
                    return (
                      <button key={rel.id} onClick={() => navigate(refPath(rel.id, rel.title))} className="group text-left">
                        <div className="relative aspect-video overflow-hidden rounded-xl bg-secondary border hairline">
                          {thumb ? (
                            <img src={thumb} alt={rel.title} loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{rel.type}</span>
                            </div>
                          )}
                        </div>
                        <p className="mt-2 font-serif text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">{rel.title}</p>
                        {(rel.brand || rel.agency) && (
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground line-clamp-1">{rel.brand || rel.agency}</p>
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

function InlineEdit({
  value, placeholder, onSave, className, inputType = "text",
}: {
  value: string; placeholder?: string; onSave: (v: string) => void; className?: string; inputType?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() { onSave(draft.trim()); setEditing(false); }

  if (editing) {
    return (
      <input autoFocus type={inputType} value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={`bg-transparent border-b border-primary focus:outline-none w-full ${className ?? ""}`}
      />
    );
  }
  return (
    <span className={`cursor-text group/edit ${className ?? ""}`}
      onClick={() => { setDraft(value); setEditing(true); }} title="Click to edit">
      {value || <span className="text-muted-foreground/50 italic text-sm">{placeholder ?? "—"}</span>}
      <span className="ml-1.5 text-[10px] font-mono font-normal text-muted-foreground opacity-0 group-hover/edit:opacity-60">✎</span>
    </span>
  );
}

function AdminRow({
  label, value, placeholder, onSave, inputType,
}: {
  label: string; value: string; placeholder?: string; onSave: (v: string) => void; inputType?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">{label}</dt>
      <dd className="font-display text-lg min-w-0">
        <InlineEdit value={value} placeholder={placeholder} onSave={onSave} inputType={inputType} />
      </dd>
    </div>
  );
}
