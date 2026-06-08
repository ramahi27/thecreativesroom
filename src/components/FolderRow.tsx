import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { Reference } from "@/lib/references";
import type { Folder } from "@/hooks/useFolders";
import { FolderVisibilityToggle } from "@/components/FolderVisibilityToggle";

interface Props {
  folder: Folder;
  references: Reference[];
  count: number;
  onOpen: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: () => void;
  onDropReference: (e: React.DragEvent) => void;
  draggingActive: boolean;
  username?: string | null;
  onToggleVisibility: () => void;
}

export function FolderRow({
  folder: f,
  references,
  count,
  onOpen,
  onRename,
  onDelete,
  onDropReference,
  draggingActive,
  username,
  onToggleVisibility,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(f.name);
  const [isOver, setIsOver] = useState(false);

  const imgs = references
    .map((r) => r.thumbnail_url || r.media_url)
    .filter(Boolean)
    .slice(0, 3) as string[];

  return (
    <div
      onClick={() => !renaming && onOpen()}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        onDropReference(e);
      }}
      className={`group/card relative cursor-pointer transition-all ${
        isOver ? "ring-2 ring-primary scale-[1.02]" : ""
      } ${draggingActive ? "ring-1 ring-dashed ring-border" : ""}`}
    >
      {/* Pinterest-style board mosaic */}
      <div className="rounded-2xl overflow-hidden bg-secondary aspect-square relative">
        {imgs.length >= 3 ? (
          <div className="h-full w-full flex gap-0.5">
            <div className="flex-[2] overflow-hidden">
              <img
                src={imgs[0]}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-105"
              />
            </div>
            <div className="flex-1 flex flex-col gap-0.5">
              <div className="flex-1 overflow-hidden">
                <img
                  src={imgs[1]}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-105"
                />
              </div>
              <div className="flex-1 overflow-hidden">
                <img
                  src={imgs[2]}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-105"
                />
              </div>
            </div>
          </div>
        ) : imgs.length > 0 ? (
          <img
            src={imgs[0]}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-105"
          />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-muted-foreground/30">
            <span className="font-display text-5xl font-black">
              {f.name.slice(0, 2).toUpperCase()}
            </span>
            {draggingActive && (
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                Drop here
              </span>
            )}
          </div>
        )}

        {/* ⋯ menu — appears on hover */}
        <div
          className="absolute top-2 right-2 opacity-0 group-hover/card:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-8 w-8 rounded-full bg-background/90 backdrop-blur-md hairline flex items-center justify-center text-foreground hover:bg-background transition-colors"
                aria-label="Folder options"
              >
                <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="font-mono text-xs uppercase tracking-widest min-w-[200px]">
              <div className="px-2 py-1.5">
                <FolderVisibilityToggle
                  isPublic={f.is_public}
                  onToggle={onToggleVisibility}
                  username={username || null}
                  folderId={f.id}
                  folderName={f.name}
                />
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setRenameValue(f.name); setRenaming(true); }}>
                <Pencil className="h-3 w-3 mr-2" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (confirm(`Delete folder "${f.name}"? Projects will not be deleted.`)) onDelete();
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3 w-3 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Name + count below the card */}
      <div className="mt-2.5 px-0.5">
        {renaming ? (
          <Input
            autoFocus
            value={renameValue}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") { if (renameValue.trim()) onRename(f.id, renameValue.trim()); setRenaming(false); }
              if (e.key === "Escape") setRenaming(false);
            }}
            onBlur={() => { if (renameValue.trim()) onRename(f.id, renameValue.trim()); setRenaming(false); }}
            className="h-8 text-sm font-display"
          />
        ) : (
          <h3 className="font-display text-base font-black tracking-tight truncate group-hover/card:text-primary transition-colors">
            {f.name}
          </h3>
        )}
        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">
          {count} {count === 1 ? "ref" : "refs"} {f.is_public ? "· Public" : ""}
        </p>
      </div>
    </div>
  );
}
