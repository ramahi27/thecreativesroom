import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2, ChevronRight, ImageIcon, UserPlus } from "lucide-react";
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
  onInvite?: () => void;
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
  onInvite,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(f.name);
  const [isOver, setIsOver] = useState(false);

  const thumbs = references
    .map((r) => r.thumbnail_url || r.media_url)
    .filter(Boolean)
    .slice(0, 8) as string[];

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
      className={`group/row relative cursor-pointer rounded-3xl border p-5 transition-all ${
        isOver ? "ring-2 ring-primary scale-[1.01]" : "hairline hover:bg-secondary/40"
      } ${draggingActive ? "border-dashed" : ""}`}
    >
      <div className="flex flex-col md:flex-row md:items-center gap-5 md:gap-10">
        {/* Left: name + meta */}
        <div className="shrink-0 md:w-[240px] min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
            Collection
          </p>
          {renaming ? (
            <Input
              autoFocus
              value={renameValue}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  if (renameValue.trim()) onRename(f.id, renameValue.trim());
                  setRenaming(false);
                }
                if (e.key === "Escape") setRenaming(false);
              }}
              onBlur={() => {
                if (renameValue.trim()) onRename(f.id, renameValue.trim());
                setRenaming(false);
              }}
              className="h-11 text-xl font-display"
            />
          ) : (
            <h3 className="font-display text-3xl md:text-4xl font-black tracking-tighter leading-[0.95] truncate">
              {f.name}
            </h3>
          )}
          <p className="mt-2 font-mono text-xs text-muted-foreground inline-flex items-center gap-1">
            {count} {count === 1 ? "reference" : "references"}
            <ChevronRight className="h-3 w-3 opacity-0 -translate-x-1 transition-all group-hover/row:opacity-100 group-hover/row:translate-x-0" strokeWidth={2} />
          </p>
        </div>

        {/* Right: thumbnail strip */}
        <div className="flex gap-2.5 overflow-x-auto flex-1 min-w-0 pb-1 [scrollbar-width:thin]">
          {thumbs.length > 0 ? (
            thumbs.map((thumb, i) => (
              <div
                key={i}
                className="h-28 w-24 md:h-32 md:w-28 shrink-0 rounded-2xl overflow-hidden bg-secondary"
              >
                <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
              </div>
            ))
          ) : (
            <div className="h-28 md:h-32 flex-1 rounded-2xl border border-dashed hairline flex items-center justify-center gap-2 text-muted-foreground">
              <ImageIcon className="h-4 w-4" strokeWidth={1.5} />
              <span className="font-mono text-[10px] uppercase tracking-widest">
                {draggingActive ? "Drop here" : "Empty — drag references in"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Management menu */}
      <div className="absolute top-4 right-4" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-background/80 backdrop-blur-md hairline text-muted-foreground hover:text-foreground opacity-0 group-hover/row:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 transition-opacity"
              aria-label="Folder options"
            >
              <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="font-mono text-xs uppercase tracking-widest min-w-[200px]"
          >
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
            {onInvite && (
              <DropdownMenuItem onClick={onInvite}>
                <UserPlus className="h-3 w-3 mr-2" /> Invite collaborator
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => {
                setRenameValue(f.name);
                setRenaming(true);
              }}
            >
              <Pencil className="h-3 w-3 mr-2" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (confirm(`Delete folder "${f.name}"? Projects will not be deleted.`)) {
                  onDelete();
                }
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3 w-3 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
