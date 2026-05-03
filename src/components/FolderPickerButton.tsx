import { useState } from "react";
import { FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useFolders } from "@/hooks/useFolders";
import { useBookmarks } from "@/hooks/useBookmarks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  referenceId: string;
  className?: string;
}

export function FolderPickerButton({ referenceId, className }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { folders, foldersForReference, addToFolder, removeFromFolder, createFolder } =
    useFolders();
  const { isBookmarked, toggle } = useBookmarks();
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const inIds = foldersForReference(referenceId);
  const active = inIds.length > 0;

  const ensureBookmarked = async () => {
    if (!isBookmarked(referenceId)) {
      const { error } = await toggle(referenceId);
      if (error) {
        toast.error(error);
        return false;
      }
    }
    return true;
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.message("Sign in to organize", {
        description: "Save references into folders in your collection.",
        action: { label: "Sign in", onClick: () => navigate("/auth") },
      });
      return;
    }
    setOpen((v) => !v);
  };

  const handleToggleFolder = async (folderId: string, isIn: boolean) => {
    if (isIn) {
      await removeFromFolder(folderId, referenceId);
    } else {
      const ok = await ensureBookmarked();
      if (!ok) return;
      await addToFolder(folderId, [referenceId]);
      const name = folders.find((f) => f.id === folderId)?.name;
      toast.success(`Added to ${name}`);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const ok = await ensureBookmarked();
    if (!ok) return;
    const f = await createFolder(newName.trim());
    if (f) {
      await addToFolder(f.id, [referenceId]);
      toast.success(`Added to ${f.name}`);
    }
    setNewName("");
    setDialogOpen(false);
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            onClick={handleTriggerClick}
            aria-label="Add to folder"
            className={cn(
              "absolute top-3 right-12 z-10 h-8 w-8 flex items-center justify-center rounded-full backdrop-blur-md transition-all",
              "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              active
                ? "opacity-100 bg-primary text-primary-foreground"
                : "bg-background/80 text-foreground hover:bg-background",
              className,
            )}
          >
            <FolderPlus className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="font-mono text-xs uppercase tracking-widest min-w-[220px] max-h-[320px] overflow-y-auto"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <DropdownMenuLabel>Add to folder</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {folders.length === 0 && (
            <div className="px-2 py-2 text-[10px] normal-case tracking-normal text-muted-foreground">
              No folders yet.
            </div>
          )}
          {folders.map((f) => {
            const isIn = inIds.includes(f.id);
            return (
              <DropdownMenuCheckboxItem
                key={f.id}
                checked={isIn}
                onSelect={(e) => {
                  e.preventDefault();
                  handleToggleFolder(f.id, isIn);
                }}
              >
                {f.name}
              </DropdownMenuCheckboxItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setOpen(false);
              setDialogOpen(true);
            }}
          >
            + New folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="sm:max-w-[420px]"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="font-display text-2xl tracking-tight">
              New folder
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Folder name"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              className="font-mono text-xs uppercase tracking-widest"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              className="font-mono text-xs uppercase tracking-widest"
            >
              Create & add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
