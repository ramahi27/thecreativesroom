import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
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
import { X } from "lucide-react";

function metadataToTags(m: any): string[] {
  const out: string[] = [];
  if (m?.mood) out.push(`mood:${m.mood}`);
  if (m?.tone) out.push(`tone:${m.tone}`);
  if (m?.colour_palette) out.push(`palette:${m.colour_palette}`);
  if (m?.industry) out.push(`industry:${m.industry}`);
  if (m?.format) out.push(`format:${m.format}`);
  if (Array.isArray(m?.tags)) out.push(...m.tags.map((t: string) => String(t).trim()).filter(Boolean));
  return out;
}

const AddReference = () => {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const isEdit = !!editId;
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { video: VIDEO_CATEGORIES, photo: PHOTO_CATEGORIES } = useCategories();

  const [type, setType] = useState<RefType>(isAdmin ? "video" : "image");
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [thumbnailUrl] = useState("");
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

  function removeExisting(idx: number) {
    setExistingMedia((prev) => prev.filter((_, i) => i !== idx));
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
      const finalThumb = thumbnailUrl || auto || firstImage;

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
        tags: tags
          ? tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
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
      if (savedId) {
        const finalImg = finalThumb || items.find((i) => i.kind === "image")?.url || null;
        supabase.functions
          .invoke("generate-metadata", {
            body: { title, brand: brand || null, image_url: finalImg },
          })
          .then(async ({ data, error }) => {
            const meta = (data as any)?.metadata;
            if (error || !meta) return;
            const newTags = metadataToTags(meta);
            const { data: cur } = await supabase
              .from("references")
              .select("tags,notes")
              .eq("id", savedId!)
              .maybeSingle();
            const existing: string[] = Array.isArray(cur?.tags) ? (cur!.tags as string[]) : [];
            const merged = Array.from(new Set([...existing, ...newTags]));
            const update: any = { tags: merged };
            if (meta.curatorial_note && !cur?.notes) update.notes = meta.curatorial_note;
            await supabase.from("references").update(update).eq("id", savedId!);
          })
          .catch(() => {});
      }

      if (isEdit) {
        navigate(`/ref/${editId}`);
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

  const inputCls = "bg-secondary border-0 font-mono";
  const labelCls = "font-mono text-[10px] uppercase tracking-widest text-muted-foreground";

  return (
    <div className="min-h-screen grain">
      <SiteHeader />
      <main className="container max-w-2xl py-12">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-4">
          ⏵ {isEdit ? "Edit entry" : "New entry"}
        </p>
        <h1 className="font-display text-5xl font-black tracking-tighter mb-10">
          {isEdit ? "Edit reference." : "Add reference."}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {isAdmin && (
            <div>
              <Label className={labelCls}>Type</Label>
              <div className="mt-2 flex gap-2">
                {(["video", "image"] as RefType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setType(t);
                      const allowed = t === "video" ? VIDEO_CATEGORIES : PHOTO_CATEGORIES;
                      setCategories((prev) => prev.filter((c) => (allowed as readonly string[]).includes(c)));
                    }}
                    className={`px-4 py-2 font-mono text-xs uppercase tracking-widest border hairline transition-colors ${
                      type === t ? "bg-primary text-primary-foreground border-primary" : "hover:bg-secondary"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className={labelCls}>Categories (multi-select)</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {(type === "video" ? VIDEO_CATEGORIES : PHOTO_CATEGORIES).map((c) => {
                const active = categories.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategories((prev) => (active ? prev.filter((x) => x !== c) : [...prev, c]))}
                    className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest border hairline transition-colors ${
                      active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-secondary"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label className={labelCls}>Title *</Label>
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </div>

          <div className="space-y-2">
            <Label className={labelCls}>
              {type === "video" ? "Video link (YouTube, Vimeo, IG…) *" : "External link (YouTube, Vimeo, IG…)"}
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
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Videos can only be added via link. Uploads are photo-only.
              </p>
            )}
          </div>

          {existingMedia.length > 0 && (
            <div className="space-y-2">
              <Label className={labelCls}>Current media</Label>
              <ul className="space-y-1">
                {existingMedia.map((m, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 bg-secondary px-3 py-2">
                    <span className="font-mono text-[11px] truncate">
                      {m.kind === "video" ? "🎬" : "🖼"} {m.url.split("/").pop()}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeExisting(i)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {type === "image" && (
            <div className="space-y-2">
              <Label className={labelCls}>
                {isEdit ? "Add more photos" : "Upload photos (multiple allowed)"}
              </Label>
              <label
                htmlFor="reference-files"
                className="relative flex flex-col items-center justify-center gap-2 cursor-pointer bg-secondary hairline border border-dashed border-muted-foreground/40 hover:border-muted-foreground/70 hover:bg-secondary/70 transition-colors px-6 py-12 text-center"
              >
                <span className="font-mono text-xs uppercase tracking-widest text-foreground">
                  Click here or drag and drop to add a photo.
                </span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Photos only · multiple allowed
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
                <ul className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 bg-secondary px-3 py-2">
                      <span className="font-mono text-[11px] truncate">🖼 {f.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className={labelCls}>Brand</Label>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-2">
              <Label className={labelCls}>Agency</Label>
              <Input value={agency} onChange={(e) => setAgency(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-2">
              <Label className={labelCls}>Year</Label>
              <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className={labelCls}>Tags (comma separated)</Label>
            <Input
              placeholder="cinematic, automotive, slow-motion"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className={inputCls}
            />
          </div>


          <div className="flex items-center gap-3 pt-4">
            <Button
              type="submit"
              disabled={submitting}
              className="font-mono text-xs uppercase tracking-widest h-12 px-8"
            >
              {submitting ? progress || "Saving…" : isEdit ? "Save changes" : isAdmin ? "Add to archive" : "Submit for review"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate(isEdit ? `/ref/${editId}` : "/")}
              className="font-mono text-xs uppercase tracking-widest h-12"
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
