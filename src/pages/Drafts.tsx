import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { ReferenceCard } from "@/components/ReferenceCard";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import type { Reference } from "@/lib/references";
import { Check, Trash2, CheckCheck } from "lucide-react";

const PAGE_SIZE = 24;

const Drafts = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [drafts, setDrafts] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    document.title = "Drafts — The Ref Room";
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setLoading(true);
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count } = await supabase
        .from("references")
        .select("*", { count: "exact" })
        .eq("published", false)
        .order("created_at", { ascending: false })
        .range(from, to);
      setDrafts(((data as unknown) as Reference[]) || []);
      setTotal(count || 0);
      setLoading(false);
    })();
  }, [isAdmin, page]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  // Wait for admin check to complete before redirecting (avoids race after login)
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

  async function publish(id: string) {
    setBusyId(id);
    const { error } = await supabase.from("references").update({ published: true }).eq("id", id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    setDrafts((d) => d.filter((r) => r.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    toast.success("Published");
  }

  async function remove(id: string) {
    if (!confirm("Delete this draft permanently?")) return;
    setBusyId(id);
    const { error } = await supabase.from("references").delete().eq("id", id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    setDrafts((d) => d.filter((r) => r.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    toast.success("Deleted");
  }

  async function publishAllOnPage() {
    if (!confirm(`Publish all ${drafts.length} drafts on this page?`)) return;
    const ids = drafts.map((d) => d.id);
    const { error } = await supabase.from("references").update({ published: true }).in("id", ids);
    if (error) return toast.error(error.message);
    setDrafts([]);
    setTotal((t) => Math.max(0, t - ids.length));
    toast.success(`Published ${ids.length}`);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="min-h-screen grain">
      <SiteHeader />

      <section className="border-b hairline">
        <div className="container py-12">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary mb-4">
            ⏵ DRAFTS · {total} pending
          </p>
          <h1 className="font-display text-5xl md:text-7xl font-black leading-[0.85] tracking-tighter">
            Review &<br />
            <span className="italic font-light">approve.</span>
          </h1>
          <p className="mt-6 max-w-xl font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Imported references waiting to go live. Publish to add to the main archive, or delete.
          </p>
          {drafts.length > 0 && (
            <Button
              onClick={publishAllOnPage}
              variant="outline"
              size="sm"
              className="mt-6 font-mono text-xs uppercase tracking-widest"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-2" /> Publish all on this page
            </Button>
          )}
        </div>
      </section>

      <main className="container py-12">
        {loading ? (
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Loading drafts…
          </p>
        ) : drafts.length === 0 ? (
          <p className="font-display text-3xl text-muted-foreground italic py-20 text-center">
            No drafts pending.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {drafts.map((r) => (
                <div key={r.id} className="relative group">
                  <ReferenceCard reference={r} />
                  <div className="absolute bottom-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <Button
                      size="icon"
                      variant="default"
                      disabled={busyId === r.id}
                      onClick={(e) => { e.preventDefault(); publish(r.id); }}
                      className="h-9 w-9"
                      title="Publish"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="destructive"
                      disabled={busyId === r.id}
                      onClick={(e) => { e.preventDefault(); remove(r.id); }}
                      className="h-9 w-9"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-12">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="font-mono text-xs uppercase tracking-widest"
                >
                  ← Prev
                </Button>
                <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="font-mono text-xs uppercase tracking-widest"
                >
                  Next →
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Drafts;
