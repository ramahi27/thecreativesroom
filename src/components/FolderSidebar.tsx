import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2, Inbox, Layers, Check, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Folder } from "@/hooks/useFolders";
import { useFolders } from "@/hooks/useFolders";
import { FolderVisibilityToggle } from "@/components/FolderVisibilityToggle";

interface Props {
  folders: Folder[];
  countForFolder: (id: string) => number;
  totalCount: number;
  uncategorizedCount: number;
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (name: string) => Promise<unknown>;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onDropOnFolder: (folderId: string, e: React.DragEvent) => void;
  draggingActive: boolean;
  username?: string | null;
}

const COLORS = [
  { name: "Coral", value: "hsl(8 85% 62%)" },
  { name: "Amber", value: "hsl(38 92% 55%)" },
  { name: "Lime", value: "hsl(85 65% 50%)" },
  { name: "Emerald", value: "hsl(160 60% 45%)" },
  { name: "Sky", value: "hsl(200 80% 55%)" },
  { name: "Indigo", value: "hsl(245 65% 62%)" },
  { name: "Magenta", value: "hsl(320 70% 60%)" },
  { name: "Slate", value: "hsl(220 10% 55%)" },
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
  username,
}: Props) {
  const { updateColor, setVisibility } = useFolders();
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

  const itemBase =
    "group/folder relative w-full flex items-stretch transition-all overflow-hidden border hairline";

  return (
    <aside className="w-full lg:w-72 lg:shrink-0">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          Folders
        </h2>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 font-mono text-[10px] uppercase tracking-widest gap-1"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-3 w-3" strokeWidth={2} />
          New
        </Button>
      </div>

      <ul className="space-y-1.5">
        <li>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={`${itemBase} ${
              activeId === null ? "bg-secondary" : "hover:bg-secondary/50"
            }`}
          >
            <span className="w-1.5 shrink-0 bg-foreground/80" />
            <span className="flex-1 flex items-center justify-between gap-2 px-3 py-2.5">
              <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest">
                <Layers className="h-3.5 w-3.5" strokeWidth={1.5} />
                All
              </span>
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                {totalCount}
              </span>
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => onSelect("uncategorized")}
            className={`${itemBase} ${
              activeId === "uncategorized" ? "bg-secondary" : "hover:bg-secondary/50"
            }`}
          >
            <span className="w-1.5 shrink-0 bg-muted-foreground/40" />
            <span className="flex-1 flex items-center justify-between gap-2 px-3 py-2.5">
              <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest">
                <Inbox className="h-3.5 w-3.5" strokeWidth={1.5} />
                Unsorted
              </span>
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                {uncategorizedCount}
              </span>
            </span>
          </button>
        </li>

        {folders.length > 0 && (
          <li className="pt-3 pb-1">
            <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground/60 px-1">
              Your folders
            </div>
          </li>
        )}

        {folders.map((f) => {
          const isActive = activeId === f.id;
          const isOver = dragOverId === f.id;
          const color = f.color || "hsl(var(--muted-foreground))";
          return (
            <li key={f.id}>
              {renamingId === f.id ? (
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
                  className="h-9 text-xs font-mono uppercase tracking-widest"
                />
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
                  className={`${itemBase} ${
                    isActive ? "bg-secondary" : "hover:bg-secondary/50"
                  } ${
                    isOver
                      ? "ring-2 ring-primary scale-[1.02] shadow-lg"
                      : ""
                  } ${draggingActive ? "border-dashed" : ""}`}
                >
                  <span
                    className="w-1.5 shrink-0 transition-all"
                    style={{ backgroundColor: color }}
                  />
                  <button
                    type="button"
                    onClick={() => onSelect(f.id)}
                    className="flex-1 flex items-center justify-between gap-2 px-3 py-2.5 text-left min-w-0"
                  >
                    <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-foreground/10"
                        style={{ backgroundColor: color }}
                      />
                      <span className="truncate">{f.name}</span>
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {countForFolder(f.id)}
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 mr-1 opacity-0 group-hover/folder:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="font-mono text-xs uppercase tracking-widest min-w-[200px]"
                    >
                      <DropdownMenuLabel className="text-[10px] text-muted-foreground">
                        Color
                      </DropdownMenuLabel>
                      <div className="grid grid-cols-8 gap-1 px-2 pb-2">
                        {COLORS.map((c) => {
                          const active = f.color === c.value;
                          return (
                            <button
                              key={c.value}
                              type="button"
                              title={c.name}
                              onClick={() => updateColor(f.id, c.value)}
                              className="h-5 w-5 rounded-full ring-1 ring-foreground/10 flex items-center justify-center transition-transform hover:scale-110"
                              style={{ backgroundColor: c.value }}
                            >
                              {active && (
                                <Check className="h-3 w-3 text-white" strokeWidth={3} />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1.5">
                        <FolderVisibilityToggle
                          isPublic={f.is_public}
                          onToggle={() => setVisibility(f.id, !f.is_public)}
                          username={username || null}
                          folderId={f.id}
                          folderName={f.name}
                        />
                      </div>
                      <DropdownMenuSeparator />
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
                          if (
                            confirm(`Delete folder "${f.name}"? Projects will not be deleted.`)
                          ) {
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
              className="h-9 text-xs font-mono uppercase tracking-widest"
            />
          </li>
        )}

        {folders.length === 0 && !creating && (
          <li>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full px-3 py-4 border border-dashed hairline text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:bg-secondary/40 hover:text-foreground transition-colors"
            >
              + Create your first folder
            </button>
          </li>
        )}
      </ul>

      {draggingActive && (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-primary animate-pulse">
          ⏵ Drop on a folder
        </p>
      )}
    </aside>
  );
}
