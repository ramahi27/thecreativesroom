import { Plus } from "lucide-react";
import type { Folder } from "@/hooks/useFolders";
import type { Reference } from "@/lib/references";

interface Props {
  folder: Folder;
  references: Reference[];
  count: number;
  onClick: () => void;
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

export function FolderGridCard({ folder, references, count, onClick }: Props) {
  const color = folder.color || "hsl(var(--muted-foreground))";
  const thumbs = references.map(thumbOf);
  const [t1, t2, t3] = [thumbs[0], thumbs[1], thumbs[2]];
  const tags = topTags(references);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left flex flex-col border hairline bg-card transition-all hover:border-foreground hover:shadow-xl hover:-translate-y-0.5"
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
            <div className="h-full w-full" style={{ backgroundColor: color, opacity: 0.25 }} />
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
        <span
          className="absolute top-2 left-2 h-2.5 w-2.5 rounded-full ring-2 ring-background"
          style={{ backgroundColor: color }}
          aria-hidden
        />
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
