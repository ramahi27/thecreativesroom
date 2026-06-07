import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { PageMeta } from "@/components/PageMeta";
import { SiteFooter } from "@/components/SiteFooter";
import { useCategories } from "@/hooks/useCategories";
import { useFolders } from "@/hooks/useFolders";
import { useMyProfile } from "@/hooks/useProfile";
import { useFollowedFolders } from "@/hooks/useFollows";
import { CollectionProfileHeader } from "@/components/CollectionProfileHeader";
import { CollectionCard } from "@/components/CollectionCard";
import { ReferenceCard } from "@/components/ReferenceCard";
import { Globe } from "lucide-react";

import { FolderRow } from "@/components/FolderRow";
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
import { Search, FolderPlus, X, ChevronLeft, Plus } from "lucide-react";
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
  const [sortBy, setSortBy] = useState<"recent" | "title" | "year_new" | "year_old">("recent");

  // Folders
  const {
    folders,
    countForFolder,
    foldersForReference,
    items,
    loading: foldersLoading,
    createFolder,
    renameFolder,
    deleteFolder,
    addToFolder,
    removeFromFolder,
    setVisibility,
  } = useFolders();
  const { profile, loading: profileLoading, refresh: refreshProfile } = useMyProfile();
  const { folders: followed, loading: followedLoading } = useFollowedFolders();
  const [tab, setTab] = useState<"mine" | "following" | "submitted">("mine");
  const [submissions, setSubmissions] = useState<Reference[]>([]);
  const [submissionsLoaded, setSubmissionsLoaded] = useState(false);
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
    let cancelled = false;
    const fetchRefs = async () => {
      const { data: marks } = await supabase
        .from("bookmarks")
        .select("reference_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      const ids = (marks || []).map((m: any) => m.reference_id);
      if (ids.length === 0) {
        if (!cancelled) {
          setRefs([]);
          setLoading(false);
        }
        return;
      }
      const { data: list } = await supabase.from("references").select("*").in("id", ids);
      const byId = new Map((list || []).map((r: any) => [r.id, r as Reference]));
      const ordered = ids.map((i) => byId.get(i)).filter(Boolean) as Reference[];
      if (!cancelled) {
        setRefs(ordered);
        setLoading(false);
      }
    };
    fetchRefs();
    const handler = () => fetchRefs();
    window.addEventListener("bookmarks:refresh", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("bookmarks:refresh", handler);
    };
  }, [user]);

  useEffect(() => {
    if (!user || tab !== "submitted" || submissionsLoaded) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("references")
        .select("id,title,type,media_url,source_url,thumbnail_url,brand,agency,year,tags,categories,published,media_items,created_at")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setSubmissions((data as unknown as Reference[]) || []);
        setSubmissionsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user, tab, submissionsLoaded]);

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
    const list = refs.filter((r) => {
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
          ...((r as any).tag_synonyms || []),
          ...(r.categories || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // refs already arrive newest-bookmarked first, which is the "recent" default.
    if (sortBy === "recent") return list;
    const sorted = [...list];
    switch (sortBy) {
      case "title":
        sorted.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        break;
      case "year_new":
        sorted.sort((a, b) => (b.year || 0) - (a.year || 0));
        break;
      case "year_old":
        sorted.sort((a, b) => (a.year || 9999) - (b.year || 9999));
        break;
    }
    return sorted;
  }, [refs, mediaFilter, categoryFilter, search, sortBy, activeFolder, items, uncategorizedIds]);

  const activeFolderName =
    activeFolder === null
      ? "All references"
      : activeFolder === "uncategorized"
        ? "Unsorted"
        : folders.find((f) => f.id === activeFolder)?.name ?? "All references";

  // Thumbnails for the active folder hero strip
  const folderThumbs = useMemo(() => {
    if (!activeFolder || activeFolder === "uncategorized") return [];
    return filtered
      .map((r) => r.thumbnail_url || r.media_url)
      .filter(Boolean)
      .slice(0, 9) as string[];
  }, [activeFolder, filtered]);

  // References that belong to a given folder (for the folder index rows)
  const refsInFolder = (folderId: string) =>
    refs.filter((r) => items.some((it) => it.folder_id === folderId && it.reference_id === r.id));

  // Unsorted references — shown at the bottom of the index
  const unsortedRefs = useMemo(
    () => refs.filter((r) => uncategorizedIds.has(r.id)),
    [refs, uncategorizedIds],
  );

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
      <PageMeta title="My Collection — The Creatives Room" description="Your saved references." noindex />
      <SiteHeader />
      <CollectionProfileHeader
        profile={profile}
        loading={profileLoading}
        onSaved={refreshProfile}
      />
      <section className="border-b hairline bg-background/60 backdrop-blur-xl sticky top-16 z-40">
        <div className="container flex gap-8">
          {([
            { k: "mine", label: "My collection", count: refs.length },
            { k: "submitted", label: "Submitted", count: submissions.length },
            { k: "following", label: "Following", count: followed.length },
          ] as const).map((t) => {
            const active = tab === t.k;
            return (
              <button
                key={t.k}
                type="button"
                onClick={() => {
                  setTab(t.k);
                  setActiveFolder(null);
                }}
                className={`py-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] transition-colors border-b-2 ${
                  active
                    ? "text-foreground border-primary"
                    : "text-muted-foreground hover:text-foreground border-transparent"
                }`}
              >
                {t.label}
                <span className={`tabular-nums text-[10px] ${active ? "text-primary" : "text-muted-foreground/60"}`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </section>


      <main className="container py-12">
        {tab === "submitted" ? (
          !submissionsLoaded ? (
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading…</p>
          ) : submissions.length === 0 ? (
            <div className="py-20 text-center">
              <p className="font-display text-3xl text-muted-foreground italic">
                You haven't submitted any references yet.
              </p>
              <Link
                to="/add"
                className="inline-block mt-8 px-6 py-3 bg-primary text-primary-foreground font-mono text-xs uppercase tracking-widest hover:opacity-90"
              >
                + Add reference
              </Link>
            </div>
          ) : (
            <div className="columns-2 md:columns-3 xl:columns-4 gap-4">
              {(() => {
                const order = submissions.map((x) => x.id);
                return submissions.map((r) => (
                  <div key={r.id} className="break-inside-avoid mb-4">
                    <ReferenceCard reference={r} orderedIds={order} masonry />
                  </div>
                ));
              })()}
            </div>
          )
        ) : tab === "following" ? (
          followedLoading ? (
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Loading…
            </p>
          ) : followed.length === 0 ? (
            <div className="py-20 text-center">
              <p className="font-display text-3xl text-muted-foreground italic">
                You're not following any collections yet.
              </p>
              <p className="mt-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Tap the heart on any public collection to follow it.
              </p>
              <Link
                to="/"
                className="inline-block mt-8 px-6 py-3 bg-primary text-primary-foreground font-mono text-xs uppercase tracking-widest hover:opacity-90"
              >
                Browse archive
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {followed.map((f) => {
                const t = f.refs.slice(0, 4).map((r) => r.thumbnail_url || r.media_url).filter(Boolean);
                return (
                  <Link
                    key={f.id}
                    to={`/u/${f.owner_username}/${(f.name || "").toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`}
                    className="group block border hairline bg-card hover:border-foreground transition-all hover:-translate-y-0.5"
                  >
                    <div className="relative aspect-[4/3] grid grid-cols-2 grid-rows-2 gap-0.5 bg-muted overflow-hidden">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="bg-secondary overflow-hidden">
                          {t[i] ? (
                            <img
                              src={t[i] as string}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="h-full w-full bg-muted" />
                          )}
                        </div>
                      ))}
                      <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 bg-background/80 backdrop-blur-md font-mono text-[9px] uppercase tracking-widest">
                        <Globe className="h-2.5 w-2.5" strokeWidth={2} /> Public
                      </span>
                    </div>
                    <div className="p-4 flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="font-display text-xl font-bold tracking-tight truncate">
                          {f.name}
                        </h3>
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground tabular-nums shrink-0">
                          {f.refs.length} {f.refs.length === 1 ? "ref" : "refs"}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        by @{f.owner_username}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        ) : loading || foldersLoading ? (
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
        ) : activeFolder ? (
          /* ============ FOLDER DETAIL ============ */
          <div className="space-y-8">
            <button
              type="button"
              onClick={() => setActiveFolder(null)}
              className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} /> My collection
            </button>

            {/* Pinterest-style folder hero */}
            <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-12 pb-8 border-b hairline">
              <div className="shrink-0 md:max-w-[260px]">
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-3">
                  Collection
                </p>
                <h2 className="font-display text-4xl md:text-6xl font-black tracking-tighter leading-[0.9] mb-4">
                  {activeFolderName}
                </h2>
                <p className="font-mono text-sm text-muted-foreground">
                  {filtered.length} {filtered.length === 1 ? "reference" : "references"}
                </p>
              </div>
              {folderThumbs.length > 0 && (
                <div className="flex gap-2.5 overflow-x-auto flex-1 pb-1 [scrollbar-width:thin]">
                  {folderThumbs.map((thumb, i) => (
                    <div key={i} className="h-36 w-28 shrink-0 rounded-2xl overflow-hidden bg-secondary">
                      <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              <Select
                value={mediaFilter}
                onValueChange={(v) => {
                  setMediaFilter(v as MediaFilter);
                  setCategoryFilter("all");
                }}
              >
                <SelectTrigger className="w-[110px] h-9 bg-secondary border-0 font-mono text-[11px] uppercase tracking-widest">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="font-mono text-xs uppercase tracking-widest">All</SelectItem>
                  <SelectItem value="videos" className="font-mono text-xs uppercase tracking-widest">Videos</SelectItem>
                  <SelectItem value="photos" className="font-mono text-xs uppercase tracking-widest">Photos</SelectItem>
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[170px] h-9 bg-secondary border-0 font-mono text-[11px] uppercase tracking-widest">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="font-mono text-xs uppercase tracking-widest">All categories</SelectItem>
                  {availableCategories.map((c) => (
                    <SelectItem key={c} value={c} className="font-mono text-xs uppercase tracking-widest">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-[155px] h-9 bg-secondary border-0 font-mono text-[11px] uppercase tracking-widest">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent" className="font-mono text-xs uppercase tracking-widest">Recent</SelectItem>
                  <SelectItem value="title" className="font-mono text-xs uppercase tracking-widest">Title A–Z</SelectItem>
                  <SelectItem value="year_new" className="font-mono text-xs uppercase tracking-widest">Newest first</SelectItem>
                  <SelectItem value="year_old" className="font-mono text-xs uppercase tracking-widest">Oldest first</SelectItem>
                </SelectContent>
              </Select>

              <div className="relative w-[190px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="pl-9 h-9 bg-secondary border-0 font-mono text-[11px] uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal"
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="py-20 text-center border border-dashed hairline">
                <p className="font-display text-2xl text-muted-foreground italic">
                  {search.trim() || mediaFilter !== "all" || categoryFilter !== "all"
                    ? "No matches."
                    : "This folder is empty."}
                </p>
                {!search.trim() && mediaFilter === "all" && categoryFilter === "all" && (
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Drag references here, or use the ⋯ menu on a card.
                  </p>
                )}
              </div>
            ) : (
              <div className="columns-2 md:columns-3 xl:columns-4 gap-4">
                {(() => {
                  const order = filtered.map((x) => x.id);
                  return filtered.map((r) => (
                    <div key={r.id} className="break-inside-avoid mb-4">
                      <CollectionCard
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
                        orderedIds={order}
                        masonry
                      />
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        ) : (
          /* ============ FOLDER INDEX ============ */
          <div className="space-y-10">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                {folders.length} {folders.length === 1 ? "folder" : "folders"}
              </h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openCreateFolderDialog([])}
                className="font-mono text-[10px] uppercase tracking-widest h-9 gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} /> New folder
              </Button>
            </div>

            {/* Folder rows, stacked */}
            {folders.length > 0 && (
              <div className="space-y-4">
                {folders.map((f) => (
                  <FolderRow
                    key={f.id}
                    folder={f}
                    references={refsInFolder(f.id)}
                    count={countForFolder(f.id)}
                    onOpen={() => setActiveFolder(f.id)}
                    onRename={renameFolder}
                    onDelete={() => deleteFolder(f.id)}
                    onDropReference={(e) => handleDropOnFolder(f.id, e)}
                    draggingActive={dragging}
                    username={profile?.username}
                    onToggleVisibility={() => setVisibility(f.id, !f.is_public)}
                  />
                ))}
              </div>
            )}

            {folders.length === 0 && (
              <button
                type="button"
                onClick={() => openCreateFolderDialog([])}
                className="w-full rounded-3xl border border-dashed hairline py-12 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
              >
                + Create your first folder
              </button>
            )}

            {/* Unsorted projects at the bottom */}
            {unsortedRefs.length > 0 && (
              <div className="pt-4">
                <div className="flex items-baseline justify-between mb-6">
                  <h2 className="font-display text-3xl font-black tracking-tighter">
                    Unsorted
                    <span className="ml-3 font-mono text-base font-normal text-muted-foreground">
                      {unsortedRefs.length}
                    </span>
                  </h2>
                  {folders.length > 0 && (
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Drag onto a folder above
                    </span>
                  )}
                </div>
                <div className="columns-2 md:columns-3 xl:columns-4 gap-4">
                  {(() => {
                    const order = unsortedRefs.map((x) => x.id);
                    return unsortedRefs.map((r) => (
                      <div key={r.id} className="break-inside-avoid mb-4">
                        <CollectionCard
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
                          orderedIds={order}
                          masonry
                        />
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}
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
