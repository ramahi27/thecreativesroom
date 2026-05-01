import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { useCategories } from "@/hooks/useCategories";
import { useFolders } from "@/hooks/useFolders";
import { CollectionCard } from "@/components/CollectionCard";
import { FolderSidebar } from "@/components/FolderSidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, FolderPlus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Reference } from "@/lib/references";

type MediaFilter = "all" | "videos" | "photos";

const Bookmarks = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [refs, setRefs] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);

  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Folders
  const {
    folders,
    countForFolder,
    foldersForReference,
    items,
    createFolder,
    renameFolder,
    deleteFolder,
    addToFolder,
    removeFromFolder,
  } = useFolders();
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectionMode = selected.size > 0;

  // Drag state
  const [dragging, setDragging] = useState(false);

  // New folder dialog
  const [folderDialog, setFolderDialog] = useState<{ open: boolean; refIds: string[] }>({
    open: false,
    refIds: [],
  });
  const [newFolderName, setNewFolderName] = useState("");

  const { video: VIDEO_CATEGORIES, photo: PHOTO_CATEGORIES } = useCategories();

  useEffect(() => {
    document.title = "My Collection — The Creatives Room";
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: marks } = await supabase
        .from("bookmarks")
        .select("reference_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      const ids = (marks || []).map((m: any) => m.reference_id);
      if (ids.length === 0) {
        setRefs([]);
        setLoading(false);
        return;
      }
      const { data: list } = await supabase.from("references").select("*").in("id", ids);
      const byId = new Map((list || []).map((r: any) => [r.id, r as Reference]));
      const ordered = ids.map((i) => byId.get(i)).filter(Boolean) as Reference[];
      setRefs(ordered);
      setLoading(false);
    })();
  }, [user]);

  const availableCategories = useMemo(() => {
    if (mediaFilter === "videos") return VIDEO_CATEGORIES;
    if (mediaFilter === "photos") return PHOTO_CATEGORIES;
    return [...VIDEO_CATEGORIES, ...PHOTO_CATEGORIES];
  }, [mediaFilter, VIDEO_CATEGORIES, PHOTO_CATEGORIES]);

  const uncategorizedIds = useMemo(() => {
    const inAny = new Set(items.map((i) => i.reference_id));
    return new Set(refs.filter((r) => !inAny.has(r.id)).map((r) => r.id));
  }, [items, refs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return refs.filter((r) => {
      // folder filter
      if (activeFolder === "uncategorized") {
        if (!uncategorizedIds.has(r.id)) return false;
      } else if (activeFolder) {
        const inFolder = items.some(
          (it) => it.folder_id === activeFolder && it.reference_id === r.id,
        );
        if (!inFolder) return false;
      }
      if (mediaFilter === "videos" && !(r.type === "video" || r.type === "link")) return false;
      if (mediaFilter === "photos" && r.type !== "image") return false;
      if (categoryFilter !== "all" && !(r.categories || []).includes(categoryFilter)) return false;
      if (q) {
        const hay = [
          r.title,
          r.brand,
          r.agency,
          r.notes,
          r.year ? String(r.year) : "",
          ...(r.tags || []),
          ...(r.categories || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [refs, mediaFilter, categoryFilter, search, activeFolder, items, uncategorizedIds]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const handleDropOnFolder = async (folderId: string, e: React.DragEvent) => {
    const droppedId = e.dataTransfer.getData("text/reference-id");
    // If dragged card is part of the selection, move all selected. Otherwise, just the dragged one.
    const ids =
      droppedId && selected.has(droppedId) && selected.size > 1
        ? Array.from(selected)
        : droppedId
          ? [droppedId]
          : [];
    if (ids.length === 0) return;
    await addToFolder(folderId, ids);
    const folderName = folders.find((f) => f.id === folderId)?.name;
    toast({
      title: `Added ${ids.length} ${ids.length === 1 ? "project" : "projects"} to ${folderName}`,
    });
    if (ids.length > 1) clearSelection();
  };

  const openCreateFolderDialog = (refIds: string[] = []) => {
    setFolderDialog({ open: true, refIds });
    setNewFolderName("");
  };

  const submitNewFolder = async () => {
    if (!newFolderName.trim()) return;
    const folder = await createFolder(newFolderName.trim());
    if (folder && folderDialog.refIds.length > 0) {
      await addToFolder(folder.id, folderDialog.refIds);
      toast({ title: `Added to ${folder.name}` });
    }
    setFolderDialog({ open: false, refIds: [] });
    setNewFolderName("");
  };

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen grain">
      <SiteHeader />
      <section className="border-b hairline">
        <div className="container py-12 md:py-16">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-4">⏵ Saved</p>
          <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[0.9]">
            My <span className="italic font-light">Collection</span>.
          </h1>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {refs.length} {refs.length === 1 ? "reference" : "references"} saved · {folders.length}{" "}
            {folders.length === 1 ? "folder" : "folders"}
          </p>
        </div>
      </section>

      {/* Filter bar */}
      {refs.length > 0 && (
        <section className="border-b hairline bg-background/80 backdrop-blur-xl">
          <div className="container py-4 flex flex-wrap items-center gap-4">
            <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              Filter
            </span>
            <Select
              value={mediaFilter}
              onValueChange={(v) => {
                setMediaFilter(v as MediaFilter);
                setCategoryFilter("all");
              }}
            >
              <SelectTrigger className="w-[160px] bg-secondary border-0 font-mono text-xs uppercase tracking-widest">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="font-mono text-xs uppercase tracking-widest">
                  All
                </SelectItem>
                <SelectItem value="videos" className="font-mono text-xs uppercase tracking-widest">
                  Videos
                </SelectItem>
                <SelectItem value="photos" className="font-mono text-xs uppercase tracking-widest">
                  Photos
                </SelectItem>
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[220px] bg-secondary border-0 font-mono text-xs uppercase tracking-widest">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="font-mono text-xs uppercase tracking-widest">
                  All categories
                </SelectItem>
                {availableCategories.map((c) => (
                  <SelectItem
                    key={c}
                    value={c}
                    className="font-mono text-xs uppercase tracking-widest"
                  >
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative flex-1 min-w-[200px] max-w-md ml-auto">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
                strokeWidth={1.5}
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search client, brand, tag…"
                className="pl-9 bg-secondary border-0 font-mono text-xs uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal"
              />
            </div>
          </div>
        </section>
      )}

      <main className="container py-12">
        {loading ? (
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Loading…
          </p>
        ) : refs.length === 0 ? (
          <div className="py-20 text-center">
            <p className="font-display text-3xl text-muted-foreground italic">
              Nothing in your collection yet.
            </p>
            <p className="mt-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Tap the bookmark icon on any reference to save it to your collection.
            </p>
            <Link
              to="/"
              className="inline-block mt-8 px-6 py-3 bg-primary text-primary-foreground font-mono text-xs uppercase tracking-widest hover:opacity-90"
            >
              Browse archive
            </Link>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8">
            <FolderSidebar
              folders={folders}
              countForFolder={countForFolder}
              totalCount={refs.length}
              uncategorizedCount={uncategorizedIds.size}
              activeId={activeFolder}
              onSelect={setActiveFolder}
              onCreate={(name) => createFolder(name)}
              onRename={renameFolder}
              onDelete={(id) => {
                if (activeFolder === id) setActiveFolder(null);
                deleteFolder(id);
              }}
              onDropOnFolder={handleDropOnFolder}
              draggingActive={dragging}
            />

            <div className="flex-1 min-w-0">
              {filtered.length === 0 ? (
                <div className="py-20 text-center">
                  <p className="font-display text-3xl text-muted-foreground italic">
                    Nothing here.
                  </p>
                  <p className="mt-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    Drag a project onto a folder, or use the folder menu on a card.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                  {filtered.map((r) => (
                    <CollectionCard
                      key={r.id}
                      reference={r}
                      folders={folders}
                      inFolderIds={foldersForReference(r.id)}
                      selected={selected.has(r.id)}
                      selectionMode={selectionMode}
                      onToggleSelect={toggleSelect}
                      onAddToFolder={addToFolder}
                      onRemoveFromFolder={removeFromFolder}
                      onCreateFolder={() => openCreateFolderDialog([r.id])}
                      onDragStart={() => setDragging(true)}
                      onDragEnd={() => setDragging(false)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Bulk action bar */}
      {selectionMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 bg-background border hairline shadow-2xl">
          <span className="font-mono text-xs uppercase tracking-widest">
            {selected.size} selected
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className="font-mono text-xs uppercase tracking-widest gap-1.5"
              >
                <FolderPlus className="h-3.5 w-3.5" strokeWidth={1.5} />
                Add to folder
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="center"
              className="font-mono text-xs uppercase tracking-widest min-w-[200px]"
            >
              <DropdownMenuLabel>Move to…</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {folders.length === 0 && (
                <div className="px-2 py-2 text-[10px] normal-case tracking-normal text-muted-foreground">
                  No folders yet.
                </div>
              )}
              {folders.map((f) => (
                <DropdownMenuItem
                  key={f.id}
                  onClick={async () => {
                    await addToFolder(f.id, Array.from(selected));
                    toast({
                      title: `Added ${selected.size} to ${f.name}`,
                    });
                    clearSelection();
                  }}
                >
                  {f.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openCreateFolderDialog(Array.from(selected))}>
                + New folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="ghost"
            onClick={clearSelection}
            className="font-mono text-xs uppercase tracking-widest"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Button>
        </div>
      )}

      {/* New folder dialog */}
      <Dialog
        open={folderDialog.open}
        onOpenChange={(open) => setFolderDialog((s) => ({ ...s, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">New folder</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="e.g. Color stories, Editorial, Brand films…"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitNewFolder();
            }}
          />
          {folderDialog.refIds.length > 0 && (
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {folderDialog.refIds.length} {folderDialog.refIds.length === 1 ? "project" : "projects"}{" "}
              will be added.
            </p>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setFolderDialog({ open: false, refIds: [] })}
              className="font-mono text-xs uppercase tracking-widest"
            >
              Cancel
            </Button>
            <Button
              onClick={submitNewFolder}
              className="font-mono text-xs uppercase tracking-widest"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SiteFooter />
    </div>
  );
};

export default Bookmarks;
