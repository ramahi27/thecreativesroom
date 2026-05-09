import { useState } from "react";
import { ReferenceCard } from "@/components/ReferenceCard";
import type { Reference } from "@/lib/references";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { FolderPlus, X } from "lucide-react";
import type { Folder } from "@/hooks/useFolders";

interface Props {
  reference: Reference;
  folders: Folder[];
  inFolderIds: string[];
  selected: boolean;
  selectionMode: boolean;
  onToggleSelect: (id: string) => void;
  onAddToFolder: (folderId: string, referenceIds: string[]) => void;
  onRemoveFromFolder: (folderId: string, referenceId: string) => void;
  onCreateFolder: () => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  orderedIds?: string[];
}

export function CollectionCard({
  reference: r,
  folders,
  inFolderIds,
  selected,
  selectionMode,
  onToggleSelect,
  onAddToFolder,
  onRemoveFromFolder,
  onCreateFolder,
  onDragStart,
  onDragEnd,
  orderedIds,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/reference-id", r.id);
        e.dataTransfer.effectAllowed = "copy";
        onDragStart(r.id);
      }}
      onDragEnd={onDragEnd}
      className={`relative group/wrapper transition-opacity ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
    >
      {/* Selection checkbox */}
      <div
        className={`absolute top-3 left-3 z-20 transition-opacity ${
          selectionMode || selected ? "opacity-100" : "opacity-0 group-hover/wrapper:opacity-100"
        }`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleSelect(r.id);
          }}
          className="flex h-6 w-6 items-center justify-center rounded bg-background/90 backdrop-blur-md border hairline hover:bg-background"
          aria-label={selected ? "Deselect" : "Select"}
        >
          <Checkbox checked={selected} className="pointer-events-none" />
        </button>
      </div>

      {/* Folder menu */}
      <div className="absolute top-3 right-12 z-20 opacity-70 group-hover/wrapper:opacity-100 transition-opacity">
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 bg-background/90 backdrop-blur-md hover:bg-background"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <FolderPlus className="h-3.5 w-3.5" strokeWidth={1.5} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="font-mono text-xs uppercase tracking-widest min-w-[200px]"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuLabel>Add to folder</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {folders.length === 0 && (
              <div className="px-2 py-2 text-[10px] normal-case tracking-normal text-muted-foreground">
                No folders yet.
              </div>
            )}
            {folders.map((f) => {
              const isIn = inFolderIds.includes(f.id);
              return (
                <DropdownMenuCheckboxItem
                  key={f.id}
                  checked={isIn}
                  onCheckedChange={() => {
                    if (isIn) onRemoveFromFolder(f.id, r.id);
                    else onAddToFolder(f.id, [r.id]);
                  }}
                >
                  {f.name}
                </DropdownMenuCheckboxItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCreateFolder}>+ New folder</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ReferenceCard reference={r} orderedIds={orderedIds} />

      {inFolderIds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {inFolderIds.map((fid) => {
            const f = folders.find((x) => x.id === fid);
            if (!f) return null;
            return (
              <span
                key={fid}
                className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 border hairline bg-background/60 backdrop-blur-sm font-mono text-[10px] uppercase tracking-widest group/chip"
              >
                <span className="truncate max-w-[120px]">{f.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemoveFromFolder(fid, r.id);
                  }}
                  className="h-4 w-4 inline-flex items-center justify-center rounded-sm hover:bg-destructive/20 hover:text-destructive transition-colors"
                  aria-label={`Remove from ${f.name}`}
                >
                  <X className="h-2.5 w-2.5" strokeWidth={2} />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
