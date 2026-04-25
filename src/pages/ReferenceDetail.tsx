import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Reference } from "@/lib/references";
import { detectPlatform } from "@/lib/references";

const ReferenceDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [r, setR] = useState<Reference | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.from("references").select("*").eq("id", id).maybeSingle();
      setR(data as Reference | null);
      if (data) document.title = `${data.title} — REEL`;
      setLoading(false);
    })();
  }, [id]);

  async function handleDelete() {
    if (!r || !confirm("Delete this reference?")) return;
    const { error } = await supabase.from("references").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    navigate("/");
  }

  if (loading) return (
    <div className="min-h-screen grain"><SiteHeader /></div>
  );
  if (!r) return (
    <div className="min-h-screen grain">
      <SiteHeader />
      <main className="container py-20">
        <p className="font-display text-3xl italic text-muted-foreground">Not found.</p>
      </main>
    </div>
  );

  const platform = detectPlatform(r.source_url);
  const display = r.media_url || r.thumbnail_url;

  return (
    <div className="min-h-screen grain">
      <SiteHeader />
      <main className="container py-12 max-w-6xl">
        <Link to="/" className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
          ← Back to archive
        </Link>

        <div className="grid lg:grid-cols-5 gap-10 mt-8">
          <div className="lg:col-span-3">
            <div className="bg-card border hairline overflow-hidden">
              {r.type === "video" && r.media_url && r.media_url.match(/\.(mp4|webm|mov)$/i) ? (
                <video src={r.media_url} controls className="w-full" />
              ) : display ? (
                <img src={display} alt={r.title} className="w-full" />
              ) : (
                <div className="aspect-video flex items-center justify-center bg-secondary">
                  <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                    No preview
                  </span>
                </div>
              )}
            </div>

            {r.source_url && (
              <a
                href={r.source_url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block font-mono text-xs uppercase tracking-widest text-primary hover:underline"
              >
                ↗ Open on {platform || "source"}
              </a>
            )}
          </div>

          <aside className="lg:col-span-2 space-y-6">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary mb-3">
                ⏵ {r.type}
              </p>
              <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter leading-[0.95]">
                {r.title}
              </h1>
            </div>

            <dl className="space-y-3 border-t hairline pt-6">
              {r.brand && <Row label="Brand" value={r.brand} />}
              {r.agency && <Row label="Agency" value={r.agency} />}
              {r.year && <Row label="Year" value={String(r.year)} />}
            </dl>

            {r.tags?.length > 0 && (
              <div className="border-t hairline pt-6">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                  Tags
                </p>
                <div className="flex flex-wrap gap-2">
                  {r.tags.map((t) => (
                    <span key={t} className="font-mono text-xs px-2 py-1 bg-secondary">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {r.notes && (
              <div className="border-t hairline pt-6">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                  Notes
                </p>
                <p className="font-body text-sm leading-relaxed whitespace-pre-wrap">
                  {r.notes}
                </p>
              </div>
            )}

            {isAdmin && (
              <div className="border-t hairline pt-6">
                <Button variant="destructive" onClick={handleDelete} className="font-mono text-xs uppercase tracking-widest">
                  Delete
                </Button>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="font-display text-lg">{value}</dd>
    </div>
  );
}

export default ReferenceDetail;
