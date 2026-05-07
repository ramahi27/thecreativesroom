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
import { Globe, Share2 } from "lucide-react";
import { profileUrl } from "@/lib/username";
import { slugify } from "@/lib/slug";
import { toast } from "sonner";
import Bookmarks from "@/pages/Bookmarks";
import type { Reference } from "@/lib/references";
import type { Folder } from "@/hooks/useFolders";

type FolderWithRefs = Folder & { user_id: string; refs: Reference[] };

const UserProfile = () => {
  const { username } = useParams();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading, notFound } = useProfileByUsername(username);
  const navigate = useNavigate();

  const isOwner = !!user && !!profile && user.id === profile.user_id;

  // Owner view = full collection management UI (Bookmarks page already has SiteHeader/Footer + everything)
  if (isOwner) return <Bookmarks />;

  const [folders, setFolders] = useState<FolderWithRefs[]>([]);
  const [submissions, setSubmissions] = useState<Reference[]>([]);

  useEffect(() => {
    if (profile) document.title = `@${profile.username} — The Creatives Room`;
  }, [profile]);

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

  if (loading || authLoading) {
    return (
      <div className="min-h-screen grain">
        <SiteHeader />
        <main className="container py-20">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading…</p>
        </main>
      </div>
    );
  }

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
      if (navigator.share) {
        await navigator.share({ url, title: `@${profile.username}` });
        return;
      }
    } catch {}
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Profile link copied");
    } catch {}
  };

  const showSubs = profile.submissions_public !== false;
  const nothingPublic = folders.length === 0 && (!showSubs || submissions.length === 0);

  return (
    <div className="min-h-screen grain">
      <SiteHeader />

      <section className="border-b hairline">
        <div className="container py-12 md:py-16">
          <div className="flex flex-col md:flex-row md:items-end gap-6 md:gap-10">
            <div className="h-24 w-24 md:h-32 md:w-32 shrink-0 bg-secondary border hairline overflow-hidden flex items-center justify-center">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.username} className="h-full w-full object-cover" />
              ) : (
                <span className="font-display text-3xl md:text-4xl font-black">{initials}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-2">⏵ Profile</p>
              <h1 className="font-display text-4xl md:text-6xl font-black tracking-tighter leading-[0.95]">
                @{profile.username}
              </h1>
              {profile.bio && (
                <p className="mt-4 max-w-2xl font-body text-base md:text-lg text-foreground/90 leading-relaxed">
                  {profile.bio}
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  {folders.length} {folders.length === 1 ? "collection" : "collections"}
                </span>
                {showSubs && (
                  <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    · {submissions.length} {submissions.length === 1 ? "submission" : "submissions"}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleShare}
                    className="font-mono text-[10px] uppercase tracking-widest h-8 gap-1.5"
                  >
                    <Share2 className="h-3 w-3" strokeWidth={1.8} /> Share
                  </Button>
                  {!user ? (
                    <Button
                      size="sm"
                      onClick={() => navigate("/auth")}
                      className="font-mono text-[10px] uppercase tracking-widest h-8"
                    >
                      Sign in to follow
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="container py-12 space-y-16">
        {nothingPublic ? (
          <div className="py-20 text-center">
            <p className="font-display text-3xl md:text-4xl text-muted-foreground italic">
              Nothing public yet.
            </p>
          </div>
        ) : (
          <>
            {folders.length > 0 && (
              <section>
                <div className="flex items-baseline justify-between mb-5">
                  <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                    Public collections
                  </h2>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {folders.length} {folders.length === 1 ? "folder" : "folders"}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {folders.map((f) => {
                    const t = f.refs.slice(0, 4).map((r) => r.thumbnail_url || r.media_url).filter(Boolean);
                    return (
                      <Link
                        key={f.id}
                        to={`/u/${profile.username}/${slugify(f.name)}`}
                        className="group block border hairline bg-card hover:border-foreground transition-all hover:-translate-y-0.5"
                      >
                        <div className="relative aspect-[4/3] grid grid-cols-2 grid-rows-2 gap-0.5 bg-muted overflow-hidden">
                          {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="bg-secondary overflow-hidden">
                              {t[i] ? (
                                <img src={t[i] as string} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                              ) : (
                                <div className="h-full w-full bg-muted" />
                              )}
                            </div>
                          ))}
                          <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 bg-background/80 backdrop-blur-md font-mono text-[9px] uppercase tracking-widest">
                            <Globe className="h-2.5 w-2.5" strokeWidth={2} /> Public
                          </span>
                        </div>
                        <div className="p-4 flex flex-col gap-2.5">
                          <div className="flex items-baseline justify-between gap-3">
                            <h3 className="font-display text-xl font-bold tracking-tight truncate">{f.name}</h3>
                            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground tabular-nums shrink-0">
                              {f.refs.length} {f.refs.length === 1 ? "ref" : "refs"}
                            </span>
                          </div>
                          <FollowButton folderId={f.id} ownerUserId={f.user_id} size="sm" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {showSubs && submissions.length > 0 && (
              <section>
                <div className="flex items-baseline justify-between mb-5">
                  <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                    Submissions
                  </h2>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {submissions.length} {submissions.length === 1 ? "ref" : "refs"}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {submissions.map((r) => (
                    <ReferenceCard key={r.id} reference={r} />
                  ))}
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
