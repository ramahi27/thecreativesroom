import { Link } from "react-router-dom";
import { useState } from "react";
import type { Reference } from "@/lib/references";
import { detectPlatform } from "@/lib/references";
import { Play, ImageIcon, Link2 } from "lucide-react";
import { BookmarkButton } from "@/components/BookmarkButton";
import { FolderPickerButton } from "@/components/FolderPickerButton";
import { rememberModalReturn, setModalNavOrder, clearModalNavOrder } from "@/lib/modalReturn";

interface Props {
  reference: Reference;
  /** Ordered list of reference IDs visible on the calling page, used to
   *  drive prev/next navigation inside the detail modal. */
  orderedIds?: string[];
}

// Smart object-position heuristic: faces, headlines, and main subjects in
// photo references usually sit in the upper-middle of the frame. Bias the
// crop based on the natural aspect ratio so the focal point stays visible
// inside the card.
function smartPosition(w: number, h: number): string {
  if (!w || !h) return "center";
  const ratio = w / h;
  if (ratio < 0.85) return "center 25%"; // portrait — face/copy usually upper
  if (ratio < 1.2) return "center 30%";  // square-ish
  if (ratio < 2) return "center 40%";    // standard landscape
  return "center";                        // ultra-wide / cinematic
}

export function ReferenceCard({ reference: r, orderedIds }: Props) {
  // For photo projects, always prefer the first photo as the thumbnail.
  const firstMediaImage = (() => {
    const items = (r as any).media_items as Array<{ url?: string; kind?: string }> | undefined;
    if (!Array.isArray(items)) return null;
    const firstImg = items.find((it) => it?.kind === "image" && it.url);
    return firstImg?.url ?? null;
  })();
  const thumb = r.type === "image"
    ? (firstMediaImage || r.thumbnail_url || r.media_url)
    : (r.thumbnail_url || null);
  const platform = detectPlatform(r.source_url);
  const [pos, setPos] = useState<string>("center 35%");

  const Icon = r.type === "video" ? Play : r.type === "image" ? ImageIcon : Link2;

  return (
    <Link
      to={`/ref/${r.id}`}
      onClick={() => {
        rememberModalReturn();
        if (orderedIds && orderedIds.length > 0) setModalNavOrder(orderedIds);
        else clearModalNavOrder();
      }}
      className="reveal-card group block overflow-hidden bg-card border hairline"
    >
      <div className="relative aspect-video overflow-hidden bg-muted">
        <BookmarkButton referenceId={r.id} />
        <FolderPickerButton referenceId={r.id} />
        {thumb ? (
          <img
            src={thumb}
            alt={r.title}
            loading="lazy"
            onLoad={(e) => {
              const img = e.currentTarget;
              setPos(smartPosition(img.naturalWidth, img.naturalHeight));
            }}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            style={{ objectPosition: pos }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary to-background">
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

        <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1.5 bg-background/80 px-2 py-1 backdrop-blur-md">
            <Icon className="h-3 w-3" strokeWidth={1.5} />
            <span className="font-mono text-[10px] uppercase tracking-widest">{r.type}</span>
          </div>
          {r.categories?.map((c) => (
            <span
              key={c}
              className="bg-background/80 px-2 py-1 backdrop-blur-md font-mono text-[10px] uppercase tracking-widest"
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="leading-tight line-clamp-2 font-light font-serif text-xl">
            {r.title}
          </h3>
          {r.year && (
            <span className="font-mono text-xs text-muted-foreground shrink-0">{r.year}</span>
          )}
        </div>

        {(() => {
          const isMagazine = (r.categories || []).includes("Magazine Covers");
          const showAgency = !isMagazine && r.agency;
          if (!r.brand && !showAgency) return null;
          return (
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {r.brand}
              {r.brand && showAgency && <span className="mx-1.5 opacity-50">/</span>}
              {showAgency && r.agency}
            </p>
          );
        })()}


      </div>
    </Link>
  );
}
