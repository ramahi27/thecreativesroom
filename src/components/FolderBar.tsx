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

// Pinned chip (All / Unsorted) — no management menu.
function StaticChip({
  icon: Icon,
  label,
  count,
  active,
  accent,
  onClick,
}: {
  icon: typeof Layers;
  label: string;
  count: number;
  active: boolean;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group/chip inline-flex items-center gap-2 shrink-0 rounded-full border pl-3 pr-3 py-2 transition-all ${
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-card hairline text-foreground hover:bg-secondary"
      }`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.8} style={!active ? { color: accent } : undefined} />
      <span className="font-mono text-[11px] uppercase tracking-widest">{label}</span>
      <span
        className={`font-mono text-[10px] tabular-nums rounded-full px-1.5 py-0.5 ${
          active ? "bg-background/20" : "bg-secondary text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

export function FolderBar({
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

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 [scrollbar-width:thin]">
      <StaticChip
        icon={Layers}
        label="All"
        count={totalCount}
        active={activeId === null}
        accent="hsl(var(--foreground))"
        onClick={() => onSelect(null)}
      />
      <StaticChip
        icon={Inbox}
        label="Unsorted"
        count={uncategorizedCount}
        active={activeId === "uncategorized"}
        accent="hsl(var(--muted-foreground))"
        onClick={() => onSelect("uncategorized")}
      />

      {folders.length > 0 && (
        <span className="shrink-0 h-6 w-px bg-border mx-1" aria-hidden />
      )}

      {folders.map((f) => {
        const isActive = activeId === f.id;
        const isOver = dragOverId === f.id;
        const color = f.color || "hsl(var(--muted-foreground))";

        if (renamingId === f.id) {
          return (
            <Input
              key={f.id}
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
              className="h-9 w-40 shrink-0 rounded-full text-xs font-mono uppercase tracking-widest"
            />
          );
        }

        return (
          <div
            key={f.id}
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
            className={`group/folder inline-flex items-center gap-2 shrink-0 rounded-full border pl-3 pr-1.5 py-2 transition-all ${
              isActive ? "bg-foreground text-background border-foreground" : "bg-card hairline hover:bg-secondary"
            } ${isOver ? "ring-2 ring-primary scale-105" : ""} ${
              draggingActive && !isActive ? "border-dashed" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(f.id)}
              className="inline-flex items-center gap-2 min-w-0"
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-foreground/10"
                style={{ backgroundColor: color }}
              />
              <span className="font-mono text-[11px] uppercase tracking-widest truncate max-w-[160px]">
                {f.name}
              </span>
              <span
                className={`font-mono text-[10px] tabular-nums rounded-full px-1.5 py-0.5 ${
                  isActive ? "bg-background/20" : "bg-secondary text-muted-foreground"
                }`}
              >
                {countForFolder(f.id)}
              </span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={`inline-flex items-center justify-center h-6 w-6 rounded-full transition-colors ${
                    isActive ? "hover:bg-background/20" : "hover:bg-foreground/10 text-muted-foreground"
                  }`}
                  aria-label="Folder options"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
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
                        {active && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
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
        );
      })}

      {creating ? (
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
          className="h-9 w-40 shrink-0 rounded-full text-xs font-mono uppercase tracking-widest"
        />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 shrink-0 rounded-full border border-dashed hairline px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          New
        </button>
      )}
    </div>
  );
}
