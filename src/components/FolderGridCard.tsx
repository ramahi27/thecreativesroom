import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Folder } from "@/hooks/useFolders";
import type { Reference } from "@/lib/references";
import { FolderVisibilityToggle } from "@/components/FolderVisibilityToggle";

interface Props {
  folder: Folder;
  references: Reference[];
  count: number;
  onClick: () => void;
  onDelete?: () => void;
  onDropReference?: (e: React.DragEvent) => void;
  draggingActive?: boolean;
  username?: string | null;
  onToggleVisibility?: () => void;
}

function thumbOf(r: Reference): string | null {
  if (r.thumbnail_url) return r.thumbnail_url;
  const items = (r as any).media_items as Array<{ thumbnail_url?: string; media_url?: string; type?: string }> | undefined;
  if (Array.isArray(items)) {
    for (const it of items) {
      if (it?.thumbnail_url) return it.thumbnail_url;
      if (it?.type === "image" && it?.media_url) return it.media_url;
    }
  }
  if (r.type === "image" && r.media_url) return r.media_url;
  return null;
}

function topTags(refs: Reference[], limit = 3): string[] {
  const counts = new Map<string, number>();
  for (const r of refs) {
    for (const t of r.tags || []) {
      if (!t) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([t]) => t);
}

export function FolderGridCard({
  folder,
  references,
  count,
  onClick,
  onDelete,
  onDropReference,
  draggingActive,
  username,
  onToggleVisibility,
}: Props) {
  const [isOver, setIsOver] = useState(false);
  const thumbs = references.map(thumbOf);
  const [t1, t2, t3] = [thumbs[0], thumbs[1], thumbs[2]];
  const tags = topTags(references);

  return (
    <div
      onDragOver={
        onDropReference
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setIsOver(true);
            }
          : undefined
      }
      onDragLeave={onDropReference ? () => setIsOver(false) : undefined}
      onDrop={
        onDropReference
          ? (e) => {
              e.preventDefault();
              setIsOver(false);
              onDropReference(e);
            }
          : undefined
      }
      className={`group relative flex flex-col border bg-card transition-all hover:border-foreground hover:shadow-xl hover:-translate-y-0.5 ${
        isOver ? "ring-2 ring-primary scale-[1.02] shadow-2xl border-primary" : "hairline"
      } ${draggingActive ? "border-dashed" : ""}`}
    >
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete folder "${folder.name}"? Projects will not be deleted.`)) {
              onDelete();
            }
          }}
          className="absolute top-2 right-2 z-10 h-7 w-7 inline-flex items-center justify-center bg-background/90 backdrop-blur-md border hairline opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
          aria-label="Delete folder"
          title="Delete folder"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      )}

      <button
        type="button"
        onClick={onClick}
        className="text-left flex flex-col"
      >
        <div className="relative aspect-[4/3] grid grid-cols-3 grid-rows-2 gap-0.5 bg-muted overflow-hidden">
          <div className="col-span-2 row-span-2 bg-secondary overflow-hidden">
            {t1 ? (
              <img
                src={t1}
                alt=""
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              <div className="h-full w-full bg-muted" />
            )}
          </div>
          <div className="bg-secondary overflow-hidden">
            {t2 ? (
              <img src={t2} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="h-full w-full bg-muted" />
            )}
          </div>
          <div className="bg-secondary overflow-hidden">
            {t3 ? (
              <img src={t3} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="h-full w-full bg-muted" />
            )}
          </div>
        </div>

        <div className="p-4 flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-display text-xl font-bold tracking-tight truncate">{folder.name}</h3>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground tabular-nums shrink-0">
              {count} {count === 1 ? "ref" : "refs"}
            </span>
          </div>
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 bg-secondary font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
              No tags yet
            </span>
          )}
        </div>
      </button>
      {onToggleVisibility && (
        <div className="px-4 pb-3 -mt-1">
          <FolderVisibilityToggle
            isPublic={folder.is_public}
            onToggle={onToggleVisibility}
            username={username || null}
            folderId={folder.id}
            folderName={folder.name}
          />
        </div>
      )}
    </div>
  );
}

export function NewFolderCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center justify-center gap-3 border border-dashed hairline bg-transparent transition-all hover:border-foreground hover:bg-secondary/40 min-h-[280px]"
    >
      <span className="h-12 w-12 rounded-full border hairline flex items-center justify-center transition-transform group-hover:scale-110 group-hover:border-foreground">
        <Plus className="h-5 w-5" strokeWidth={1.5} />
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground group-hover:text-foreground">
        New collection
      </span>
    </button>
  );
}
