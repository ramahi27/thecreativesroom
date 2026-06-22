import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfileByUsername } from "@/hooks/useProfile";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ReferenceCard } from "@/components/ReferenceCard";
import { FollowButton } from "@/components/FollowButton";
import { Share2, ArrowUpRight } from "lucide-react";
import { profileUrl } from "@/lib/username";
import { slugify } from "@/lib/slug";
import { toast } from "sonner";
import Bookmarks from "@/pages/Bookmarks";
import type { Reference } from "@/lib/references";
import type { Folder } from "@/hooks/useFolders";
import { useJsonLd } from "@/hooks/useJsonLd";
import { PageMeta } from "@/components/PageMeta";

type FolderWithRefs = Folder & { user_id: string; refs: Reference[] };

const UserProfile = () => {
  const { username } = useParams();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading, notFound } = useProfileByUsername(username);
  const navigate = useNavigate();

  const [folders, setFolders] = useState<FolderWithRefs[]>([]);
  const [submissions, setSubmissions] = useState<Reference[]>([]);
  const [tab, setTab] = useState<"collections" | "submissions">("collections");

  const isOwner = !!user && !!profile && user.id === profile.user_id;

  const jsonLd = useMemo(() => {
    if (!profile) return null;
    const url = `https://thecreativesroom.com/u/${profile.username}`;
    return {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      url,
      mainEntity: {
        "@type": "Person",
        name: (profile as any).display_name || profile.username,
        alternateName: `@${profile.username}`,
        url,
        ...((profile as any).avatar_url ? { image: (profile as any).avatar_url } : {}),
      },
    };
  }, [profile]);
  useJsonLd(jsonLd, "profile-page");

  useEffect(() => {
    if (!profile?.user_id) return;
    let cancelled = false;
    (async () => {
      const { data: f } = await supabase
        .from("folders")
        .select("id,name,color,position,is_public,user_id")
        .eq("user_id", profile.user_id)
        .eq("is_public", true)
        .order("position", { ascending: true });
      const folderRows = (f as any[]) || [];
      const folderIds = folderRows.map((x) => x.id);

      const itemsByFolder: Record<string, string[]> = {};
      const refsById: Record<string, Reference> = {};
      if (folderIds.length) {
        const { data: items } = await supabase
          .from("folder_items")
          .select("folder_id,reference_id")
          .in("folder_id", folderIds);
        const refIds = Array.from(new Set((items || []).map((it: any) => it.reference_id)));
        if (refIds.length) {
          const { data: refs } = await supabase
            .from("references")
            .select("id,title,type,media_url,source_url,thumbnail_url,brand,agency,year,tags,categories,published,media_items,created_at")
            .in("id", refIds)
            .eq("published", true);
          for (const r of (refs as any[]) || []) refsById[r.id] = r as Reference;
        }
        for (const it of (items as any[]) || []) {
          (itemsByFolder[it.folder_id] ||= []).push(it.reference_id);
        }
      }
      const withRefs: FolderWithRefs[] = folderRows.map((row) => ({
        ...(row as any),
        refs: (itemsByFolder[row.id] || []).map((rid) => refsById[rid]).filter(Boolean) as Reference[],
      }));

      let subs: any[] | null = null;
      if (profile.submissions_public !== false) {
        const { data } = await supabase
          .from("references")
          .select("id,title,type,media_url,source_url,thumbnail_url,brand,agency,year,tags,categories,published,media_items,created_at")
          .eq("created_by", profile.user_id)
          .eq("published", true)
          .order("created_at", { ascending: false });
        subs = data;
      }

      if (!cancelled) {
        setFolders(withRefs);
        setSubmissions((subs as unknown as Reference[]) || []);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.user_id, profile?.submissions_public]);

  const initials = useMemo(
    () => (profile?.username || "").slice(0, 2).toUpperCase(),
    [profile],
  );

  if (loading || authLoading) return (
    <div className="min-h-screen grain">
      <SiteHeader />
      <main className="container py-20">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground animate-pulse">Loading…</p>
      </main>
    </div>
  );

  if (isOwner) return <Bookmarks />;

  if (notFound || !profile) {
    return (
      <div className="min-h-screen grain">
        <SiteHeader />
        <main className="container py-32 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-4">⏵ 404</p>
          <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter mb-6">No such user.</h1>
          <Link to="/" className="font-mono text-xs uppercase tracking-widest underline">Back to archive</Link>
        </main>
      </div>
    );
  }

  const handleShare = async () => {
    const url = profileUrl(profile.username);
    try {
      if (navigator.share) { await navigator.share({ url, title: `@${profile.username}` }); return; }
    } catch {}
    try { await navigator.clipboard.writeText(url); toast.success("Profile link copied"); } catch {}
  };

  const showSubs = profile.submissions_public !== false;

  return (
    <div className="min-h-screen grain flex flex-col">
      <PageMeta
        title={`@${profile.username} - The Creatives Room`}
        description={
          profile.bio?.trim()
            ? profile.bio.slice(0, 155)
            : `Browse @${profile.username}'s public folders and creative references on The Creatives Room.`
        }
        path={`/u/${profile.username}`}
        ogImage={profile.avatar_url ?? undefined}
      />
      <SiteHeader />

      {/* Profile header — centered like Pinterest */}
      <section className="border-b hairline">
        <div className="container py-10 flex flex-col items-center text-center gap-4">

          {/* Avatar */}
          <div className="h-24 w-24 rounded-full overflow-hidden bg-secondary border-2 border-border shrink-0">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.username} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-primary/5">
                <span className="font-display text-3xl font-black text-primary/50">{initials}</span>
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight">
              @{profile.username}
            </h1>
            {profile.bio && (
              <p className="mt-2 max-w-md mx-auto font-body text-sm text-muted-foreground leading-relaxed">
                {profile.bio}
              </p>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="font-display text-xl font-black">{folders.length}</p>
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Collections</p>
            </div>
            {showSubs && (
              <>
                <div className="w-px h-8 bg-border" />
                <div className="text-center">
                  <p className="font-display text-xl font-black">{submissions.length}</p>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Submissions</p>
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {!user ? (
              <button
                type="button"
                onClick={() => navigate("/auth")}
                className="font-mono text-[10px] uppercase tracking-widest px-5 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-full"
              >
                Follow
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleShare}
              className="font-mono text-[10px] uppercase tracking-widest px-4 py-2 border hairline hover:border-foreground/40 transition-colors rounded-full flex items-center gap-1.5"
            >
              <Share2 className="h-3 w-3" strokeWidth={1.8} />
              Share
            </button>
          </div>
        </div>

        {/* Tabs */}
        {showSubs && submissions.length > 0 && (
          <div className="flex justify-center border-t hairline">
            {(["collections", "submissions"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`font-mono text-[10px] uppercase tracking-widest px-8 py-3 border-b-2 transition-colors ${
                  tab === t
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </section>

      <main className="container py-8 flex-1">
        {tab === "collections" && (
          folders.length === 0 ? (
            <div className="py-24 text-center">
              <p className="font-display text-3xl font-black tracking-tight text-muted-foreground/30">No collections yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {folders.map((f) => {
                const imgs = f.refs.slice(0, 3).map((r) => r.thumbnail_url || r.media_url).filter(Boolean) as string[];
                return (
                  <Link
                    key={f.id}
                    to={`/u/${profile.username}/${slugify(f.name)}`}
                    className="group block"
                  >
                    {/* Pinterest-style board mosaic */}
                    <div className="rounded-2xl overflow-hidden bg-secondary aspect-square relative">
                      {imgs.length >= 3 ? (
                        <div className="h-full w-full flex gap-0.5">
                          {/* Big left image */}
                          <div className="flex-[2] overflow-hidden">
                            <img src={imgs[0]} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          </div>
                          {/* Two small right images */}
                          <div className="flex-1 flex flex-col gap-0.5">
                            <div className="flex-1 overflow-hidden">
                              <img src={imgs[1]} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                            </div>
                            <div className="flex-1 overflow-hidden">
                              <img src={imgs[2]} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                            </div>
                          </div>
                        </div>
                      ) : imgs.length > 0 ? (
                        <img src={imgs[0]} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <span className="font-display text-5xl font-black text-muted-foreground/10">
                            {f.name.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Board info */}
                    <div className="mt-2.5 px-0.5">
                      <h3 className="font-display text-base font-black tracking-tight truncate group-hover:text-primary transition-colors">
                        {f.name}
                      </h3>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                          {f.refs.length} {f.refs.length === 1 ? "ref" : "refs"}
                        </p>
                        <div onClick={(e) => e.preventDefault()}>
                          <FollowButton folderId={f.id} ownerUserId={f.user_id} size="sm" />
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        )}

        {tab === "submissions" && showSubs && (
          submissions.length === 0 ? (
            <div className="py-24 text-center">
              <p className="font-display text-3xl font-black tracking-tight text-muted-foreground/30">No submissions yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {(() => {
                const order = submissions.map((x) => x.id);
                return submissions.map((r) => (
                  <ReferenceCard key={r.id} reference={r} orderedIds={order} />
                ));
              })()}
            </div>
          )
        )}
      </main>

      <SiteFooter />
    </div>
  );
};

export default UserProfile;
