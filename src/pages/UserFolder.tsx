import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfileByUsername } from "@/hooks/useProfile";
import { useJsonLd } from "@/hooks/useJsonLd";
import { refPath } from "@/lib/slug";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ReferenceCard } from "@/components/ReferenceCard";
import { FollowButton } from "@/components/FollowButton";
import { PageMeta } from "@/components/PageMeta";
import { Share2 } from "lucide-react";
import { folderShareUrl } from "@/lib/username";
import { slugify } from "@/lib/slug";
import { toast } from "sonner";
import type { Reference } from "@/lib/references";

const UserFolder = () => {
  const { username, folderSlug } = useParams();
  const { user } = useAuth();
  const { profile, loading: pLoading, notFound } = useProfileByUsername(username);
  const [folder, setFolder] = useState<{ id: string; name: string; is_public: boolean; user_id: string } | null>(null);
  const [refs, setRefs] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    if (!folderSlug || !profile) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: list } = await supabase
        .from("folders")
        .select("id,name,is_public,user_id")
        .eq("user_id", profile.user_id);
      const match = (list || []).find((f: any) => slugify(f.name) === folderSlug) as any;
      const isOwner = !!user && user.id === profile.user_id;
      if (!match || (!match.is_public && !isOwner)) {
        if (!cancelled) {
          setAccessDenied(true);
          setLoading(false);
        }
        return;
      }
      const { data: items } = await supabase
        .from("folder_items")
        .select("reference_id")
        .eq("folder_id", match.id);
      const ids = (items || []).map((i: any) => i.reference_id);
      let entries: Reference[] = [];
      if (ids.length) {
        const q = supabase
          .from("references")
          .select("id,title,type,media_url,source_url,thumbnail_url,brand,agency,year,tags,categories,published,media_items,created_at")
          .in("id", ids);
        const { data: rs } = isOwner ? await q : await q.eq("published", true);
        entries = (rs as unknown as Reference[]) || [];
      }
      if (!cancelled) {
        setFolder(match);
        setRefs(entries);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [folderSlug, profile, user]);

  // document.title kept as fallback; PageMeta handles canonical/og tags below

  // JSON-LD CollectionPage schema for rich search results
  const jsonLd = useMemo(() => {
    if (!folder || !profile) return null;
    return {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: folder.name,
      url: `https://thecreativesroom.com/u/${profile.username}/${folderSlug}`,
      creator: {
        "@type": "Person",
        name: profile.username,
        url: `https://thecreativesroom.com/u/${profile.username}`,
      },
      mainEntity: {
        "@type": "ItemList",
        itemListElement: refs.map((r, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `https://thecreativesroom.com${refPath(r.id, r.title)}`,
          name: r.title,
        })),
      },
    };
  }, [folder, profile, folderSlug, refs]);
  useJsonLd(jsonLd, "user-folder");

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
            <Link to={`/u/${profile.username}`} className="font-mono text-xs uppercase tracking-widest underline">
              ← Back to @{profile.username}
            </Link>
          )}
        </main>
      </div>
    );
  }

  const handleShare = async () => {
    const url = folderShareUrl(profile.username, slugify(folder.name));
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
      <PageMeta
        title={`${folder.name} · @${profile.username} — The Creatives Room`}
        description={`${refs.length} curated reference${refs.length === 1 ? "" : "s"} in ${folder.name} by @${profile.username} on The Creatives Room.`}
        path={`/u/${profile.username}/${folderSlug}`}
        ogImage={refs.find(r => r.thumbnail_url)?.thumbnail_url ?? undefined}
      />
      <SiteHeader />
      <section className="border-b hairline">
        <div className="container py-12 md:py-16">
          <Link
            to={`/u/${profile.username}`}
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
            <FollowButton folderId={folder.id} ownerUserId={folder.user_id} size="sm" />
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
            {(() => {
              const order = refs.map((x) => x.id);
              return refs.map((r) => (
                <ReferenceCard key={r.id} reference={r} orderedIds={order} />
              ));
            })()}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
};

export default UserFolder;
