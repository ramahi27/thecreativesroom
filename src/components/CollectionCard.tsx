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
import { FolderPlus, MoreVertical } from "lucide-react";
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
      <div className="absolute top-3 right-12 z-20 opacity-0 group-hover/wrapper:opacity-100 transition-opacity">
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

      <ReferenceCard reference={r} />
    </div>
  );
}
