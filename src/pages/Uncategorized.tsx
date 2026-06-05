import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ReferenceCard } from "@/components/ReferenceCard";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import type { Reference } from "@/lib/references";
import { Pencil, Tag } from "lucide-react";

const Uncategorized = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [refs, setRefs] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Uncategorized — The Creatives Room";
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("references")
        .select("*")
        .eq("published", true)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) toast.error(error.message);
      const list = ((data as unknown as Reference[]) || []).filter(
        (r) => !r.categories || r.categories.length === 0
      );
      setRefs(list);
      setLoading(false);
    })();
  }, [isAdmin]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) {
    return (
      <div className="min-h-screen grain">
        <SiteHeader />
        <main className="container py-12">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Checking permissions…
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen grain">
      <SiteHeader />

      <section className="border-b hairline">
        <div className="container py-12">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-4">
            ⏵ UNCATEGORIZED · {refs.length} missing categories
          </p>
          <h1 className="font-display text-5xl md:text-7xl font-black leading-[0.85] tracking-tighter">
            Add a<br />
            <span className="italic font-light">category.</span>
          </h1>
          <p className="mt-6 max-w-xl font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Published projects without categories. Click edit to assign one.
          </p>

          <div className="mt-8 flex gap-2">
            <Button asChild variant="outline" size="sm" className="font-mono text-xs uppercase tracking-widest">
              <Link to="/drafts">← Back to drafts</Link>
            </Button>
          </div>
        </div>
      </section>

      <main className="container py-12">
        {loading ? (
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading…</p>
        ) : refs.length === 0 ? (
          <div className="py-20 text-center">
            <Tag className="h-10 w-10 mx-auto text-muted-foreground/40 mb-4" strokeWidth={1} />
            <p className="font-display text-3xl text-muted-foreground italic">All clear.</p>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mt-3">
              Every published project has at least one category.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {refs.map((r) => (
              <div key={r.id} className="relative group">
                <ReferenceCard reference={r} orderedIds={refs.map((x) => x.id)} />
                <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <Button asChild size="icon" variant="default" className="h-9 w-9" title="Edit">
                    <Link to={`/edit/${r.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
};

export default Uncategorized;
