import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfileByUsername } from "@/hooks/useProfile";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ReferenceCard } from "@/components/ReferenceCard";
import { FollowButton } from "@/components/FollowButton";
import { Button } from "@/components/ui/button";
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
  const nothingPublic = folders.length === 0 && (!showSubs || submissions.length === 0);

  return (
    <div className="min-h-screen grain flex flex-col">
      <PageMeta
        title={`@${profile.username} — The Creatives Room`}
        description={
          profile.bio?.trim()
            ? profile.bio.slice(0, 155)
            : `Browse @${profile.username}'s public folders and creative references on The Creatives Room.`
        }
        path={`/u/${profile.username}`}
        ogImage={profile.avatar_url ?? undefined}
      />
      <SiteHeader />

      {/* Hero */}
      <section className="border-b hairline">
        <div className="container py-14 md:py-20">
          <div className="flex flex-col md:flex-row md:items-start gap-8 md:gap-12">

            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="h-28 w-28 md:h-36 md:w-36 overflow-hidden bg-secondary border hairline">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.username} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-primary/5">
                    <span className="font-display text-4xl md:text-5xl font-black text-primary/40">{initials}</span>
                  </div>
                )}
              </div>
              {/* Accent corner */}
              <div className="absolute -bottom-1.5 -right-1.5 h-4 w-4 bg-primary" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-primary mb-3">⏵ Creative</p>
              <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] mb-4 break-words">
                @{profile.username}
              </h1>

              {profile.bio && (
                <p className="max-w-xl font-body text-base text-foreground/70 leading-relaxed mb-6">
                  {profile.bio}
                </p>
              )}

              {/* Stats row */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-6">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-display text-2xl font-black">{folders.length}</span>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    {folders.length === 1 ? "Collection" : "Collections"}
                  </span>
                </div>
                {showSubs && (
                  <>
                    <div className="w-px h-4 bg-border" />
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-display text-2xl font-black">{submissions.length}</span>
                      <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                        {submissions.length === 1 ? "Submission" : "Submissions"}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleShare}
                  className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest px-4 py-2 border hairline hover:border-primary/60 hover:text-primary transition-colors"
                >
                  <Share2 className="h-3 w-3" strokeWidth={1.8} />
                  Share
                </button>
                {!user && (
                  <button
                    type="button"
                    onClick={() => navigate("/auth")}
                    className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Follow
                    <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="container py-14 flex-1 space-y-20">
        {nothingPublic ? (
          <div className="py-24 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/50 mb-3">Archive</p>
            <p className="font-display text-4xl md:text-5xl font-black tracking-tighter text-muted-foreground/30">
              Nothing public yet
            </p>
          </div>
        ) : (
          <>
            {/* Collections */}
            {folders.length > 0 && (
              <section>
                <div className="flex items-baseline justify-between mb-7">
                  <div className="flex items-center gap-3">
                    <div className="w-[2px] h-4 bg-primary" />
                    <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground">
                      Collections
                    </h2>
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    {folders.length} public
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
                  {folders.map((f) => {
                    const hero = f.refs[0]?.thumbnail_url || f.refs[0]?.media_url;
                    const thumbs = f.refs.slice(1, 4).map((r) => r.thumbnail_url || r.media_url).filter(Boolean);
                    return (
                      <Link
                        key={f.id}
                        to={`/u/${profile.username}/${slugify(f.name)}`}
                        className="group relative bg-background overflow-hidden hover:bg-primary/[0.02] transition-colors"
                      >
                        {/* Image area */}
                        <div className="relative aspect-[16/9] bg-secondary overflow-hidden">
                          {hero ? (
                            <img
                              src={hero}
                              alt={f.name}
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center">
                              <span className="font-display text-4xl font-black text-muted-foreground/10">
                                {f.name.slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                          )}
                          {/* Gradient overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                          {/* Small thumbnails strip */}
                          {thumbs.length > 0 && (
                            <div className="absolute bottom-2 right-2 flex gap-1">
                              {thumbs.map((t, i) => (
                                <div key={i} className="h-7 w-7 border border-background/60 overflow-hidden bg-secondary">
                                  <img src={t as string} alt="" className="h-full w-full object-cover" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-display text-lg font-black tracking-tight truncate group-hover:text-primary transition-colors">
                              {f.name}
                            </h3>
                            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">
                              {f.refs.length} {f.refs.length === 1 ? "ref" : "refs"}
                            </p>
                          </div>
                          <div className="shrink-0">
                            <FollowButton folderId={f.id} ownerUserId={f.user_id} size="sm" />
                          </div>
                        </div>

                        {/* Left accent bar on hover */}
                        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-bottom" />
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Submissions */}
            {showSubs && submissions.length > 0 && (
              <section>
                <div className="flex items-baseline justify-between mb-7">
                  <div className="flex items-center gap-3">
                    <div className="w-[2px] h-4 bg-primary" />
                    <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground">
                      Submissions
                    </h2>
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    {submissions.length} {submissions.length === 1 ? "ref" : "refs"}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {(() => {
                    const order = submissions.map((x) => x.id);
                    return submissions.map((r) => (
                      <ReferenceCard key={r.id} reference={r} orderedIds={order} />
                    ));
                  })()}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
};

export default UserProfile;
