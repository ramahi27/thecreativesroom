import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProfileByUsername } from "@/hooks/useProfile";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ReferenceCard } from "@/components/ReferenceCard";
import type { Reference } from "@/lib/references";
import { Share2 } from "lucide-react";
import { folderShareUrl } from "@/lib/username";
import { toast } from "sonner";

const PublicFolder = () => {
  const { handle, folderId } = useParams();
  const isHandle = !!handle && handle.startsWith("@");
  const username = isHandle ? handle!.slice(1) : undefined;
  const { profile, loading: pLoading, notFound } = useProfileByUsername(username);
  const [folder, setFolder] = useState<{ id: string; name: string; is_public: boolean } | null>(null);
  const [refs, setRefs] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    if (!folderId || !profile) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: f } = await supabase
        .from("folders")
        .select("id,name,is_public,user_id")
        .eq("id", folderId)
        .maybeSingle();
      if (!f || (f as any).user_id !== profile.user_id || !(f as any).is_public) {
        if (!cancelled) {
          setAccessDenied(true);
          setLoading(false);
        }
        return;
      }
      const { data: items } = await supabase
        .from("folder_items")
        .select("reference_id")
        .eq("folder_id", folderId);
      const ids = (items || []).map((i: any) => i.reference_id);
      let list: Reference[] = [];
      if (ids.length) {
        const { data: rs } = await supabase
          .from("references")
          .select("id,title,type,media_url,source_url,thumbnail_url,brand,agency,year,tags,categories,published,media_items,created_at")
          .in("id", ids)
          .eq("published", true);
        list = (rs as unknown as Reference[]) || [];
      }
      if (!cancelled) {
        setFolder(f as any);
        setRefs(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [folderId, profile]);

  useEffect(() => {
    if (folder && profile) document.title = `${folder.name} · @${profile.username} — The Creatives Room`;
  }, [folder, profile]);

  if (pLoading || loading) {
    return (
      <div className="min-h-screen grain">
        <SiteHeader />
        <main className="container py-20">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading…</p>
        </main>
      </div>
    );
  }

  if (notFound || !profile || accessDenied || !folder) {
    return (
      <div className="min-h-screen grain">
        <SiteHeader />
        <main className="container py-32 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-4">⏵ Not available</p>
          <h1 className="font-display text-5xl md:text-6xl font-black tracking-tighter mb-6">
            This collection is private.
          </h1>
          {profile && (
            <Link to={`/@${profile.username}`} className="font-mono text-xs uppercase tracking-widest underline">
              ← Back to @{profile.username}
            </Link>
          )}
        </main>
      </div>
    );
  }

  const handleShare = async () => {
    const url = folderShareUrl(profile.username, folder.id);
    try {
      if (navigator.share) {
        await navigator.share({ url, title: folder.name });
        return;
      }
    } catch {}
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {}
  };

  return (
    <div className="min-h-screen grain">
      <SiteHeader />
      <section className="border-b hairline">
        <div className="container py-12 md:py-16">
          <Link
            to={`/@${profile.username}`}
            className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            ← @{profile.username}
          </Link>
          <h1 className="mt-4 font-display text-5xl md:text-7xl font-black tracking-tighter leading-[0.95]">
            {folder.name}
          </h1>
          <div className="mt-4 flex items-center gap-4">
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {refs.length} {refs.length === 1 ? "reference" : "references"}
            </span>
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border hairline font-mono text-[10px] uppercase tracking-widest hover:bg-secondary"
            >
              <Share2 className="h-3 w-3" strokeWidth={1.8} /> Share
            </button>
          </div>
        </div>
      </section>

      <main className="container py-12">
        {refs.length === 0 ? (
          <p className="font-display text-2xl italic text-muted-foreground">Empty for now.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {refs.map((r) => (
              <ReferenceCard key={r.id} reference={r} />
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
};

export default PublicFolder;
