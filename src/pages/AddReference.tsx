import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { PageMeta } from "@/components/PageMeta";
import { SiteFooter } from "@/components/SiteFooter";
import { Input } from "@/components/ui/input";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  deriveThumbnail,
  fetchThumbnail,
  isVideoFile,
  type RefType,
  type MediaItem,
} from "@/lib/references";
import { useCategories } from "@/hooks/useCategories";
import { Checkbox } from "@/components/ui/checkbox";
import { X, ArrowUp, ArrowDown } from "lucide-react";
import { refPath } from "@/lib/slug";

const AI_MARKER = "ai:processed";
function metadataToTags(m: any): string[] {
  const out: string[] = [AI_MARKER];
  if (Array.isArray(m?.tags)) out.push(...m.tags.map((t: string) => String(t).trim().toLowerCase()).filter(Boolean));
  return out;
}

const AddReference = () => {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const isEdit = !!editId;
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { video: VIDEO_CATEGORIES, photo: PHOTO_CATEGORIES } = useCategories();

  const [type, setType] = useState<RefType>("video");
  const [allowMainPage, setAllowMainPage] = useState(true);
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [brand, setBrand] = useState("");
  const [agency, setAgency] = useState("");
  const [year, setYear] = useState("");
  const [tags, setTags] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [existingMedia, setExistingMedia] = useState<MediaItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [loadingRecord, setLoadingRecord] = useState(isEdit);
  const [submittedToCollection, setSubmittedToCollection] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [imageUrlPreviewOk, setImageUrlPreviewOk] = useState<boolean | null>(null);

  useEffect(() => {
    document.title = isEdit ? "Edit reference — The Creatives Room" : "Add reference — The Creatives Room";
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate, isEdit]);

  useEffect(() => {
    if (!isEdit || !editId) return;
    (async () => {
      const { data, error } = await supabase.from("references").select("*").eq("id", editId).maybeSingle();
      if (error || !data) {
        toast.error("Could not load reference");
        navigate("/");
        return;
      }
      const r: any = data;
      setType((r.type as RefType) || "video");
      setTitle(r.title || "");
      setSourceUrl(r.source_url || "");
      // thumbnail is auto-derived; no manual input
      setBrand(r.brand || "");
      setAgency(r.agency || "");
      setYear(r.year ? String(r.year) : "");
      setTags(Array.isArray(r.tags) ? r.tags.join(", ") : "");
      setCategories(Array.isArray(r.categories) ? r.categories : []);
      setNotes(r.notes || "");
      const items: MediaItem[] =
        Array.isArray(r.media_items) && r.media_items.length
          ? r.media_items
          : r.media_url
            ? [{ url: r.media_url, kind: isVideoFile(r.media_url) ? "video" : "image" }]
            : [];
      setExistingMedia(items);
      setLoadingRecord(false);
    })();
  }, [isEdit, editId, navigate]);

  if (authLoading || loadingRecord) return null;
  if (submittedToCollection) {
    return (
      <div className="min-h-screen grain">
        <SiteHeader />
        <main className="container flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center text-center py-20">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-6">
            ⏵ Saved
          </p>
          <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter mb-8 max-w-3xl">
            Added to My Collection.
          </h1>
          <p className="font-body text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed mb-10">
            Your project is now saved in your collection. You can find it anytime under My Collection.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={() => navigate("/mycollection")}
              className="font-mono text-xs uppercase tracking-widest h-12 px-8"
            >
              View My Collection
            </Button>
            <Button
              variant="ghost"
              onClick={() => window.location.reload()}
              className="font-mono text-xs uppercase tracking-widest h-12 px-8"
            >
              Add another
            </Button>
          </div>
        </main>
      </div>
    );
  }
  // Editing remains admin-only; new submissions are open to any signed-in user (saved as drafts).
  if (isEdit && !isAdmin) {
    return (
      <div className="min-h-screen grain">
        <SiteHeader />
        <main className="container max-w-md py-20">
          <h1 className="font-display text-4xl font-black tracking-tighter mb-4">Admin only.</h1>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Only admins can edit existing references.
          </p>
        </main>
      </div>
    );
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    let incoming = Array.from(list);
    const before = incoming.length;
    incoming = incoming.filter((f) => f.type.startsWith("image"));
    if (incoming.length < before) {
      toast.error("Only photo uploads are allowed. Add videos via the external link field.");
    }
    setFiles((prev) => [...prev, ...incoming]);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function addImageUrls(urls: string[]) {
    const clean = urls
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u));
    if (!clean.length) return false;
    setExistingMedia((prev) => {
      const have = new Set(prev.map((m) => m.url));
      const additions = clean
        .filter((u) => !have.has(u))
        .map((u) => ({ url: u, kind: "image" as const }));
      return [...prev, ...additions];
    });
    return true;
  }

  async function handleExternalDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const dt = e.dataTransfer;
    if (!dt) return;
    // 1) Real files dropped from the OS
    if (dt.files && dt.files.length > 0) {
      addFiles(dt.files);
      return;
    }
    // 2) URI list (most browsers when dragging an image from a tab)
    const uriList = dt.getData("text/uri-list");
    if (uriList) {
      const urls = uriList.split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
      if (addImageUrls(urls)) {
        toast.success(`Added ${urls.length} image${urls.length > 1 ? "s" : ""} from drop`);
        return;
      }
    }
    // 3) HTML fragment containing <img src="…">
    const html = dt.getData("text/html");
    if (html) {
      const matches = Array.from(html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)).map((m) => m[1]);
      if (matches.length && addImageUrls(matches)) {
        toast.success(`Added ${matches.length} image${matches.length > 1 ? "s" : ""} from drop`);
        return;
      }
    }
    // 4) Plain text URL
    const text = dt.getData("text/plain");
    if (text && addImageUrls([text])) {
      toast.success("Added image from drop");
      return;
    }
    toast.error("Could not read a dropped image. Try right-click → Copy image address, then paste below.");
  }

  function removeExisting(idx: number) {
    setExistingMedia((prev) => prev.filter((_, i) => i !== idx));
  }

  function reorderExisting(from: number, to: number) {
    setExistingMedia((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }
  function moveExisting(idx: number, dir: -1 | 1) {
    setExistingMedia((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const newItems: MediaItem[] = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setProgress(`Uploading ${i + 1}/${files.length}…`);
        const ext = f.name.split(".").pop();
        const path = `${user!.id}/${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage.from("references").upload(path, f);
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("references").getPublicUrl(path);
        newItems.push({
          url: data.publicUrl,
          kind: f.type.startsWith("video") ? "video" : "image",
        });
      }

      const items: MediaItem[] = [...existingMedia, ...newItems];
      const firstMediaUrl = items[0]?.url ?? null;
      const auto = sourceUrl ? deriveThumbnail(sourceUrl) || (await fetchThumbnail(sourceUrl)) : null;
      const firstImage = items.find((i) => i.kind === "image")?.url ?? null;
      // For photo projects, the first photo is ALWAYS the thumbnail.
      const finalThumb = type === "image"
        ? (firstImage || auto)
        : (auto || firstImage);

      setProgress("Saving…");

      const payload = {
        title,
        type,
        media_url: firstMediaUrl,
        media_items: items as any,
        source_url: sourceUrl || null,
        thumbnail_url: finalThumb,
        brand: brand || null,
        agency: agency || null,
        year: year ? parseInt(year) : null,
        tags: (() => {
          const base = tags
            ? tags.split(",").map((t) => t.trim()).filter(Boolean)
            : [];
          if (!isAdmin && !isEdit) {
            base.push(allowMainPage ? "submit-for-review" : "private-only");
          }
          return base;
        })(),
        categories,
        notes: notes || null,
      };

      let savedId: string | null = null;
      if (isEdit) {
        const { error } = await supabase.from("references").update(payload).eq("id", editId!);
        if (error) throw error;
        savedId = editId!;
        toast.success("Updated");
      } else {
        const insertPayload = {
          ...payload,
          created_by: user!.id,
          published: isAdmin,
        };
        const { data: inserted, error } = await supabase
          .from("references")
          .insert(insertPayload)
          .select("id")
          .single();
        if (error) throw error;
        savedId = inserted?.id ?? null;
        if (!isAdmin && savedId) {
          await supabase.from("bookmarks").insert({ user_id: user!.id, reference_id: savedId });
        }
      }

      // Auto-fire AI metadata generation in the background (best effort).
      // Also backfills brand/agency/year when they were left blank.
      if (savedId) {
        supabase.functions
          .invoke("generate-metadata", {
            body: {
              title,
              type,
              brand: brand || null,
              agency: agency || null,
              year: year ? Number(year) : null,
              source_url: sourceUrl || null,
              notes: notes || null,
            },
          })
          .then(async ({ data, error }) => {
            const meta = (data as any)?.metadata;
            if (error || !meta) return;
            const newTags = metadataToTags(meta);
            const { data: cur } = await supabase
              .from("references")
              .select("tags,brand,agency,year")
              .eq("id", savedId!)
              .maybeSingle();
            const existing: string[] = Array.isArray(cur?.tags) ? (cur!.tags as string[]) : [];
            const merged = Array.from(new Set([...existing, ...newTags]));
            const updates: { tags: string[]; brand?: string; agency?: string; year?: number; visual_summary?: string } = { tags: merged };
            if (!cur?.brand && typeof meta.brand === "string" && meta.brand.trim()) {
              updates.brand = meta.brand.trim();
            }
            if (!cur?.agency && typeof meta.agency === "string" && meta.agency.trim()) {
              updates.agency = meta.agency.trim();
            }
            if (!cur?.year && Number.isInteger(meta.year)) {
              updates.year = meta.year;
            }
            if (typeof meta.visual_summary === "string" && meta.visual_summary.trim()) {
              updates.visual_summary = meta.visual_summary.trim();
            }
            await supabase.from("references").update(updates).eq("id", savedId!);
          })
          .catch(() => {});
      }

      if (isEdit) {
        navigate(refPath(editId!, title));
      } else if (!isAdmin) {
        setSubmittedToCollection(true);
      } else {
        toast.success("Added to archive");
        navigate("/");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSubmitting(false);
      setProgress("");
    }
  }

  const inputCls = "rounded-xl bg-secondary/60 border-border focus:bg-background transition-colors";
  const labelCls = "font-body text-sm font-semibold";

  return (
    <div className="min-h-screen grain flex flex-col">
      <PageMeta title={isEdit ? "Edit reference — The Creatives Room" : "Add reference — The Creatives Room"} description="Add or edit a creative reference." noindex />
      <SiteHeader />
      <main className="flex-1 container max-w-2xl py-12">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary mb-4">
          ⏵ {isEdit ? "Edit entry" : "New entry"}
        </p>
        <h1 className="font-display text-5xl font-black tracking-tighter mb-10">
          {isEdit ? "Edit reference." : "Add reference."}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-7">
          {/* Type */}
          <div className="space-y-2">
            <Label className={labelCls}>Type</Label>
            <div className="flex gap-2">
              {(["video", "image"] as RefType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setType(t);
                    const allowed = t === "video" ? VIDEO_CATEGORIES : PHOTO_CATEGORIES;
                    setCategories((prev) => prev.filter((c) => (allowed as readonly string[]).includes(c)));
                  }}
                  className={`px-5 py-2 rounded-full font-mono text-[11px] uppercase tracking-widest border transition-all ${
                    type === t
                      ? "bg-foreground text-background border-foreground"
                      : "hairline hover:border-foreground/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div className="space-y-2">
            <Label className={labelCls}>Categories <span className="font-normal text-muted-foreground text-xs">(multi-select)</span></Label>
            <div className="flex flex-wrap gap-2">
              {(type === "video" ? VIDEO_CATEGORIES : PHOTO_CATEGORIES).map((c) => {
                const active = categories.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategories((prev) => (active ? prev.filter((x) => x !== c) : [...prev, c]))}
                    className={`px-4 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-widest border transition-all ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hairline hover:border-foreground/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label className={labelCls}>Title <span className="text-primary">*</span></Label>
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </div>

          {/* Source URL */}
          <div className="space-y-2">
            <Label className={labelCls}>
              {type === "video" ? "Video link" : "External link"}
              {type === "video" && <span className="text-primary"> *</span>}
              <span className="font-normal text-muted-foreground text-xs ml-1">(YouTube, Vimeo, IG…)</span>
            </Label>
            <Input
              type="url"
              required={type === "video"}
              placeholder="https://"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className={inputCls}
            />
            {type === "video" && (
              <p className="text-xs text-muted-foreground">
                Videos can only be added via link. Uploads are photo-only.
              </p>
            )}
          </div>

          {/* Existing media */}
          {existingMedia.length > 0 && (
            <div className="space-y-2">
              <Label className={labelCls}>
                Current media{existingMedia.length > 1 ? <span className="font-normal text-muted-foreground text-xs ml-1">· drag to reorder</span> : ""}
              </Label>
              <ul className="space-y-2">
                {existingMedia.map((m, i) => (
                  <li
                    key={`${m.url}-${i}`}
                    draggable={existingMedia.length > 1}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", String(i));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      if (existingMedia.length > 1) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = Number(e.dataTransfer.getData("text/plain"));
                      if (!Number.isNaN(from)) reorderExisting(from, i);
                    }}
                    className={`flex items-center justify-between gap-3 bg-secondary/60 rounded-xl px-3 py-2.5 ${existingMedia.length > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {m.kind === "image" ? (
                        <img src={m.url} alt="" className="h-10 w-10 object-cover shrink-0 rounded-lg" />
                      ) : (
                        <span className="h-10 w-10 rounded-lg grid place-items-center bg-background text-xs">🎬</span>
                      )}
                      <span className="font-mono text-[11px] truncate text-muted-foreground">
                        {i + 1}. {m.url.split("/").pop()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {existingMedia.length > 1 && (
                        <>
                          <button type="button" onClick={() => moveExisting(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1" aria-label="Move up">
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button type="button" onClick={() => moveExisting(i, 1)} disabled={i === existingMedia.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1" aria-label="Move down">
                            <ArrowDown className="h-3 w-3" />
                          </button>
                        </>
                      )}
                      <button type="button" onClick={() => removeExisting(i)} className="text-muted-foreground hover:text-foreground p-1 ml-1" aria-label="Remove">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Photo upload */}
          {type === "image" && (
            <div className="space-y-2">
              <Label className={labelCls}>
                {isEdit ? "Add more photos" : "Upload photos"}
                <span className="font-normal text-muted-foreground text-xs ml-1">(multiple allowed)</span>
              </Label>
              <label
                htmlFor="reference-files"
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
                onDrop={handleExternalDrop}
                className="relative flex flex-col items-center justify-center gap-2 cursor-pointer rounded-2xl bg-secondary/40 border border-dashed border-border hover:border-foreground/30 hover:bg-secondary/60 transition-colors px-6 py-12 text-center"
              >
                <span className="font-body text-sm font-medium">Click or drop photos here</span>
                <span className="text-xs text-muted-foreground">
                  Photos only · You can also drag images from another website
                </span>
                <input
                  id="reference-files"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => addFiles(e.target.files)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
              {files.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 bg-secondary/60 rounded-xl px-3 py-2.5">
                      <span className="font-mono text-[11px] truncate text-muted-foreground">🖼 {f.name}</span>
                      <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-foreground p-1">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Brand / Agency / Year */}
          {(() => {
            const isFilmTv = categories.includes("Film and TV scenes");
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className={labelCls}>{isFilmTv ? "Title" : "Brand"}</Label>
                  <Input value={brand} onChange={(e) => setBrand(e.target.value)} className={inputCls} />
                </div>
                <div className="space-y-2">
                  <Label className={labelCls}>{isFilmTv ? "Director" : "Agency"}</Label>
                  <Input value={agency} onChange={(e) => setAgency(e.target.value)} className={inputCls} />
                </div>
                <div className="space-y-2">
                  <Label className={labelCls}>Year</Label>
                  <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} className={inputCls} />
                </div>
              </div>
            );
          })()}

          {/* Tags */}
          <div className="space-y-2">
            <Label className={labelCls}>Tags <span className="font-normal text-muted-foreground text-xs">(comma separated)</span></Label>
            <Input
              placeholder="cinematic, automotive, slow-motion"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Submit for review checkbox */}
          {!isAdmin && !isEdit && (
            <label className="flex items-start gap-3 cursor-pointer select-none rounded-2xl bg-secondary/40 border hairline px-4 py-3">
              <Checkbox
                checked={allowMainPage}
                onCheckedChange={(v) => setAllowMainPage(v === true)}
                className="mt-0.5 rounded"
              />
              <span className="text-sm text-muted-foreground leading-relaxed">
                It's OK for admins to consider adding this project to the main archive.
              </span>
            </label>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-full font-mono text-xs uppercase tracking-widest h-11 px-8"
            >
              {submitting ? progress || "Saving…" : isEdit ? "Save changes" : isAdmin ? "Add to archive" : "Submit for review"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate(isEdit ? refPath(editId!, title) : "/")}
              className="rounded-full font-mono text-xs uppercase tracking-widest h-11"
            >
              Cancel
            </Button>
          </div>
        </form>
      </main>
      <SiteFooter />
    </div>
  );
};

export default AddReference;
