import { Link } from "react-router-dom";
import { useState } from "react";
import type { Reference } from "@/lib/references";
import { Play, ImageIcon, Link2 } from "lucide-react";
import { BookmarkButton } from "@/components/BookmarkButton";
import { FolderPickerButton } from "@/components/FolderPickerButton";
import { rememberModalReturn, setModalNavOrder, clearModalNavOrder } from "@/lib/modalReturn";
import { refPath } from "@/lib/slug";

interface Props {
  reference: Reference;
  /** Ordered list of reference IDs visible on the calling page, used to
   *  drive prev/next navigation inside the detail modal. */
  orderedIds?: string[];
  /** Disable lazy loading for above-the-fold images (improves LCP). */
  priority?: boolean;
  /** Show image at natural aspect ratio instead of forced 16:9 (masonry mode). */
  masonry?: boolean;
}

// Smart object-position heuristic: faces, headlines, and main subjects in
// photo references usually sit in the upper-middle of the frame. Bias the
// crop based on the natural aspect ratio so the focal point stays visible
// inside the card.
function smartPosition(w: number, h: number): string {
  if (!w || !h) return "center";
  const ratio = w / h;
  if (ratio < 0.75) return "center 10%";  // tall portrait — face/masthead at very top
  if (ratio < 0.85) return "center 18%";  // portrait
  if (ratio < 1.2) return "center 25%";   // square-ish
  if (ratio < 2) return "center 35%";     // standard landscape
  return "center";                         // ultra-wide / cinematic
}

export function ReferenceCard({ reference: r, orderedIds, priority, masonry }: Props) {
  // For photo projects, always prefer the first photo as the thumbnail.
  const mediaImages = (() => {
    const items = (r as any).media_items as Array<{ url?: string; kind?: string }> | undefined;
    if (!Array.isArray(items)) return [] as string[];
    return items.filter((it) => it?.kind === "image" && it.url).map((it) => it.url!) as string[];
  })();
  const firstMediaImage = mediaImages[0] ?? null;
  const extraImages = Math.max(0, mediaImages.length - 1);
  const thumb = r.type === "image"
    ? (firstMediaImage || r.thumbnail_url || r.media_url)
    : (r.thumbnail_url || null);
  const [pos, setPos] = useState<string>("center 35%");
  const [thumbError, setThumbError] = useState(false);

  const Icon = r.type === "video" ? Play : r.type === "image" ? ImageIcon : Link2;

  return (
    <Link
      to={refPath(r.id, r.title)}
      onClick={() => {
        rememberModalReturn();
        if (orderedIds && orderedIds.length > 0) setModalNavOrder(orderedIds);
        else clearModalNavOrder();
      }}
      className="reveal-card group block rounded-2xl overflow-hidden bg-card border hairline flex flex-col transition-all hover:border-foreground/20 hover:shadow-lg hover:shadow-black/20"
    >
      <div className={`relative overflow-hidden bg-muted ${masonry ? "" : "aspect-video"}`}>
        <BookmarkButton referenceId={r.id} />
        <FolderPickerButton referenceId={r.id} />
        {thumb && !thumbError ? (
          <img
            src={thumb}
            alt={r.title}
            loading={priority ? "eager" : "lazy"}
            {...(priority ? { fetchpriority: "high" } : {})}
            onLoad={(e) => {
              const img = e.currentTarget;
              setPos(smartPosition(img.naturalWidth, img.naturalHeight));
            }}
            onError={() => setThumbError(true)}
            className={masonry ? "w-full h-auto block" : "h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"}
            style={masonry ? undefined : { objectPosition: pos }}
          />
        ) : (
          <div className={`flex items-center justify-center bg-gradient-to-br from-secondary to-background ${masonry ? "aspect-video w-full" : "h-full w-full"}`}>
            <Icon className="h-10 w-10 text-muted-foreground/40" strokeWidth={1} />
          </div>
        )}

        {r.type === "video" && thumb && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Play className="h-5 w-5 fill-current" />
            </div>
          </div>
        )}
        {extraImages > 0 && (
          <div className="absolute bottom-3 left-3 bg-background/80 rounded-full px-2.5 py-1 backdrop-blur-md font-mono text-[10px] uppercase tracking-widest">
            +{extraImages} more
          </div>
        )}

        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 bg-background/75 rounded-full px-2.5 py-1 backdrop-blur-md">
            <Icon className="h-3 w-3 text-foreground/70" strokeWidth={1.5} />
            <span className="font-mono text-[10px] uppercase tracking-widest text-foreground/70">{r.type}</span>
          </div>
          {r.categories?.[0] && (
            <span className="bg-background/75 rounded-full px-2.5 py-1 backdrop-blur-md font-mono text-[10px] uppercase tracking-widest text-foreground/80">
              {r.categories[0]}
            </span>
          )}
        </div>
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1" style={{ minHeight: "7rem" }}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="leading-snug line-clamp-2 font-display font-light text-xl" title={r.title}>
            {r.title}
          </h3>
          {r.year && (
            <span className="font-mono text-[10px] text-muted-foreground/60 shrink-0 mt-1 tabular-nums">{r.year}</span>
          )}
        </div>

        {(() => {
          const isMagazine = (r.categories || []).includes("Magazine Covers");
          const showAgency = !isMagazine && r.agency && r.agency !== r.brand;
          if (!r.brand && !showAgency) return null;
          return (
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 truncate">
              {r.brand}
              {r.brand && showAgency && <span className="mx-1.5 opacity-40">·</span>}
              {showAgency && r.agency}
            </p>
          );
        })()}
      </div>
    </Link>
  );
}
