import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { deriveThumbnail, type RefType } from "@/lib/references";

const AddReference = () => {
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();

  const [type, setType] = useState<RefType>("video");
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [brand, setBrand] = useState("");
  const [agency, setAgency] = useState("");
  const [year, setYear] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Add reference — REEL";
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  if (authLoading) return null;
  if (!isAdmin) {
    return (
      <div className="min-h-screen grain">
        <SiteHeader />
        <main className="container max-w-md py-20">
          <h1 className="font-display text-4xl font-black tracking-tighter mb-4">
            Admin only.
          </h1>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Your account doesn't have admin privileges.
          </p>
        </main>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      let mediaUrl: string | null = null;

      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${user!.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("references")
          .upload(path, file);
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("references").getPublicUrl(path);
        mediaUrl = data.publicUrl;
      }

      const auto = sourceUrl ? deriveThumbnail(sourceUrl) : null;
      const finalThumb = thumbnailUrl || auto || (type === "image" ? mediaUrl : null);

      const { error } = await supabase.from("references").insert({
        title,
        type,
        media_url: mediaUrl,
        source_url: sourceUrl || null,
        thumbnail_url: finalThumb,
        brand: brand || null,
        agency: agency || null,
        year: year ? parseInt(year) : null,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        notes: notes || null,
        created_by: user!.id,
      });
      if (error) throw error;

      toast.success("Added to archive");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Failed to add");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = "bg-secondary border-0 font-mono";
  const labelCls = "font-mono text-[10px] uppercase tracking-widest text-muted-foreground";

  return (
    <div className="min-h-screen grain">
      <SiteHeader />
      <main className="container max-w-2xl py-12">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-4">⏵ New entry</p>
        <h1 className="font-display text-5xl font-black tracking-tighter mb-10">
          Add reference.
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label className={labelCls}>Type</Label>
            <div className="mt-2 flex gap-2">
              {(["video", "image", "link"] as RefType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-4 py-2 font-mono text-xs uppercase tracking-widest border hairline transition-colors ${
                    type === t ? "bg-primary text-primary-foreground border-primary" : "hover:bg-secondary"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className={labelCls}>Title *</Label>
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </div>

          <div className="space-y-2">
            <Label className={labelCls}>External link (YouTube, Vimeo, IG…)</Label>
            <Input
              type="url"
              placeholder="https://"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="space-y-2">
            <Label className={labelCls}>Or upload file (image/video)</Label>
            <Input
              type="file"
              accept="image/*,video/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className={inputCls + " file:text-foreground file:bg-transparent file:border-0"}
            />
          </div>

          <div className="space-y-2">
            <Label className={labelCls}>Thumbnail URL (optional, auto-detected for YouTube)</Label>
            <Input
              type="url"
              placeholder="https://"
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              className={inputCls}
            />
          </div>

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
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className={inputCls}
              />
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

          <div className="space-y-2">
            <Label className={labelCls}>Notes</Label>
            <Textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" disabled={submitting} className="font-mono text-xs uppercase tracking-widest h-12 px-8">
              {submitting ? "Saving…" : "Add to archive"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate("/")} className="font-mono text-xs uppercase tracking-widest h-12">
              Cancel
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default AddReference;
