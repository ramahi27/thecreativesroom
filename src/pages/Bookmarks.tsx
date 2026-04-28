import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { ReferenceCard } from "@/components/ReferenceCard";
import type { Reference } from "@/lib/references";

const Bookmarks = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [refs, setRefs] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Bookmarks — The Creatives Room";
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: marks } = await supabase
        .from("bookmarks")
        .select("reference_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      const ids = (marks || []).map((m: any) => m.reference_id);
      if (ids.length === 0) {
        setRefs([]);
        setLoading(false);
        return;
      }
      const { data: list } = await supabase.from("references").select("*").in("id", ids);
      const byId = new Map((list || []).map((r: any) => [r.id, r as Reference]));
      const ordered = ids.map((i) => byId.get(i)).filter(Boolean) as Reference[];
      setRefs(ordered);
      setLoading(false);
    })();
  }, [user]);

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen grain">
      <SiteHeader />
      <section className="border-b hairline">
        <div className="container py-12 md:py-16">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-4">⏵ Saved</p>
          <h1 className="font-display text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[0.9]">
            Your <span className="italic font-light">bookmarks</span>.
          </h1>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {refs.length} {refs.length === 1 ? "reference" : "references"} saved
          </p>
        </div>
      </section>

      <main className="container py-12">
        {loading ? (
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading…</p>
        ) : refs.length === 0 ? (
          <div className="py-20 text-center">
            <p className="font-display text-3xl text-muted-foreground italic">No bookmarks yet.</p>
            <p className="mt-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Tap the bookmark icon on any reference to save it here.
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
            {refs.map((r) => (
              <ReferenceCard key={r.id} reference={r} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Bookmarks;
