import { useState } from "react";
import { Folder as FolderIcon, MoreHorizontal, Pencil, Trash2, Inbox, FolderOpen } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Folder } from "@/hooks/useFolders";

interface Props {
  folders: Folder[];
  countForFolder: (id: string) => number;
  totalCount: number;
  uncategorizedCount: number;
  activeId: string | null; // null = All, "uncategorized" = uncategorized
  onSelect: (id: string | null) => void;
  onCreate: (name: string) => Promise<unknown>;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onDropOnFolder: (folderId: string, e: React.DragEvent) => void;
  draggingActive: boolean;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(0 70% 60%)",
  "hsl(40 90% 55%)",
  "hsl(140 50% 50%)",
  "hsl(200 70% 55%)",
  "hsl(280 60% 60%)",
];

export function FolderSidebar({
  folders,
  countForFolder,
  totalCount,
  uncategorizedCount,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onDropOnFolder,
  draggingActive,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const submitCreate = async () => {
    if (!newName.trim()) {
      setCreating(false);
      return;
    }
    await onCreate(newName.trim());
    setNewName("");
    setCreating(false);
  };

  return (
    <aside className="w-full lg:w-64 lg:shrink-0">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          Folders
        </h2>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 font-mono text-[10px] uppercase tracking-widest"
          onClick={() => setCreating(true)}
        >
          + New
        </Button>
      </div>

      <ul className="space-y-1">
        <li>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left border hairline transition-colors ${
              activeId === null ? "bg-secondary" : "hover:bg-secondary/50"
            }`}
          >
            <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest">
              <Inbox className="h-3.5 w-3.5" strokeWidth={1.5} />
              All
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">{totalCount}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => onSelect("uncategorized")}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left border hairline transition-colors ${
              activeId === "uncategorized" ? "bg-secondary" : "hover:bg-secondary/50"
            }`}
          >
            <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest">
              <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.5} />
              Unsorted
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">{uncategorizedCount}</span>
          </button>
        </li>

        {folders.map((f) => {
          const isActive = activeId === f.id;
          const isOver = dragOverId === f.id;
          return (
            <li key={f.id}>
              {renamingId === f.id ? (
                <div className="flex gap-1">
                  <Input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (renameValue.trim()) onRename(f.id, renameValue.trim());
                        setRenamingId(null);
                      }
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={() => {
                      if (renameValue.trim()) onRename(f.id, renameValue.trim());
                      setRenamingId(null);
                    }}
                    className="h-9 text-xs"
                  />
                </div>
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    setDragOverId(f.id);
                  }}
                  onDragLeave={() => setDragOverId((cur) => (cur === f.id ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverId(null);
                    onDropOnFolder(f.id, e);
                  }}
                  className={`flex items-center justify-between gap-1 border hairline transition-all ${
                    isActive ? "bg-secondary" : "hover:bg-secondary/50"
                  } ${isOver ? "ring-2 ring-primary scale-[1.02]" : ""} ${
                    draggingActive ? "border-dashed" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(f.id)}
                    className="flex-1 flex items-center justify-between gap-2 px-3 py-2 text-left min-w-0"
                  >
                    <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest min-w-0">
                      <FolderIcon
                        className="h-3.5 w-3.5 shrink-0"
                        strokeWidth={1.5}
                        style={{ color: f.color || undefined }}
                      />
                      <span className="truncate">{f.name}</span>
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                      {countForFolder(f.id)}
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7 mr-1">
                        <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="font-mono text-xs uppercase tracking-widest"
                    >
                      <DropdownMenuItem
                        onClick={() => {
                          setRenameValue(f.name);
                          setRenamingId(f.id);
                        }}
                      >
                        <Pencil className="h-3 w-3 mr-2" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          if (confirm(`Delete folder "${f.name}"? Projects will not be deleted.`)) {
                            onDelete(f.id);
                          }
                        }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-3 w-3 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </li>
          );
        })}

        {creating && (
          <li>
            <Input
              autoFocus
              placeholder="Folder name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCreate();
                if (e.key === "Escape") {
                  setNewName("");
                  setCreating(false);
                }
              }}
              onBlur={submitCreate}
              className="h-9 text-xs"
            />
          </li>
        )}
      </ul>

      {draggingActive && (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-primary">
          ⏵ Drop on a folder
        </p>
      )}
    </aside>
  );
}
