import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ReferenceCard } from "@/components/ReferenceCard";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import type { Reference } from "@/lib/references";
import { Check, Trash2, Copy } from "lucide-react";

// --- Similarity helpers -------------------------------------------------
function normalize(s: string | null | undefined) {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set([
  "the", "a", "an", "of", "and", "to", "for", "in", "on", "with", "by", "&",
  "official", "video", "ad", "ads", "film", "spot", "campaign", "case", "study",
]);

function tokens(s: string) {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function jaccard(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  A.forEach((x) => B.has(x) && inter++);
  return inter / (A.size + B.size - inter);
}

type Pair = { a: Reference; b: Reference; score: number; reason: string };

function findDuplicates(refs: Reference[]): Pair[] {
  // Group candidates by brand-normalized so we don't do O(n^2) over everything.
  const byBrand = new Map<string, Reference[]>();
  for (const r of refs) {
    const key = normalize(r.brand) || "__unknown__";
    if (!byBrand.has(key)) byBrand.set(key, []);
    byBrand.get(key)!.push(r);
  }

  const pairs: Pair[] = [];
  const seen = new Set<string>();
  const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

  for (const [, group] of byBrand) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const k = pairKey(a.id, b.id);
        if (seen.has(k)) continue;

        const ta = tokens(a.title);
        const tb = tokens(b.title);
        const titleScore = jaccard(ta, tb);
        const sameBrand = !!a.brand && !!b.brand && normalize(a.brand) === normalize(b.brand);
        const sameUrl =
          !!a.source_url && !!b.source_url && a.source_url.trim() === b.source_url.trim();

        let score = 0;
        const reasons: string[] = [];
        if (sameUrl) {
          score = 1;
          reasons.push("identical source URL");
        } else if (sameBrand && titleScore >= 0.5) {
          score = titleScore;
          reasons.push(`same brand · ${(titleScore * 100).toFixed(0)}% title match`);
        } else if (titleScore >= 0.7) {
          score = titleScore;
          reasons.push(`${(titleScore * 100).toFixed(0)}% title match`);
        }

        if (score > 0) {
          seen.add(k);
          pairs.push({ a, b, score, reason: reasons.join(" · ") });
        }
      }
    }
  }

  return pairs.sort((x, y) => y.score - x.score);
}

// --- Page --------------------------------------------------------------
const Doubletakes = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [drafts, setDrafts] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(new Set());

  useEffect(() => {
    document.title = "Doubletakes — The Creatives Room";
  }, []);

  const orderedPairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setLoading(true);
      // Load previously dismissed ("keep both") pairs
      const { data: dismissals } = await supabase
        .from("duplicate_dismissals")
        .select("ref_a_id, ref_b_id");
      if (dismissals) {
        setDismissedPairs(
          new Set(dismissals.map((d: any) => orderedPairKey(d.ref_a_id, d.ref_b_id)))
        );
      }
      // Scan BOTH drafts and published references. Pull in pages to avoid
      // the 1000-row default limit.
      const all: Reference[] = [];
      const pageSize = 1000;
      let from = 0;
      // Hard upper bound to avoid runaway loops.
      while (from < 10000) {
        const { data, error } = await supabase
          .from("references")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) {
          toast.error(error.message);
          break;
        }
        const batch = (data as unknown as Reference[]) || [];
        all.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }
      setDrafts(all);
      setLoading(false);
    })();
  }, [isAdmin]);

  const pairs = useMemo(() => findDuplicates(drafts), [drafts]);

  async function deleteOne(id: string) {
    setBusy(id);
    const { error } = await supabase.from("references").delete().eq("id", id);
    setBusy(null);
    if (error) return toast.error(error.message);
    setDrafts((d) => d.filter((r) => r.id !== id));
    setResolved((s) => new Set(s).add(id));
    toast.success("Deleted");
  }

  async function publishOne(id: string) {
    setBusy(id);
    const { error } = await supabase.from("references").update({ published: true }).eq("id", id);
    setBusy(null);
    if (error) return toast.error(error.message);
    setDrafts((d) => d.filter((r) => r.id !== id));
    setResolved((s) => new Set(s).add(id));
    toast.success("Published");
  }

  function keepBoth(a: string, b: string) {
    setResolved((s) => {
      const next = new Set(s);
      next.add(`pair:${a}:${b}`);
      // Mark both so the pair disappears from the list
      next.add(a + "::keep");
      next.add(b + "::keep");
      return next;
    });
  }

  // Adjust visible filter to honor "keep both"
  const finalPairs = pairs.filter((p) => {
    if (resolved.has(p.a.id) || resolved.has(p.b.id)) return false;
    if (resolved.has(`pair:${p.a.id}:${p.b.id}`)) return false;
    return true;
  });

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
            ⏵ DOUBLETAKES · {finalPairs.length} potential duplicates
          </p>
          <h1 className="font-display text-5xl md:text-7xl font-black leading-[0.85] tracking-tighter">
            Spot the<br />
            <span className="italic font-light">double.</span>
          </h1>
          <p className="mt-6 max-w-xl font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Drafts and published references that look suspiciously alike. Compare and decide: keep one, keep both, or delete either.
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
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Scanning {drafts.length} references…
          </p>
        ) : finalPairs.length === 0 ? (
          <div className="py-20 text-center">
            <Copy className="h-10 w-10 mx-auto text-muted-foreground/40 mb-4" strokeWidth={1} />
            <p className="font-display text-3xl text-muted-foreground italic">
              No doubletakes found.
            </p>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mt-3">
              All clear among {drafts.length} references.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {finalPairs.map((p) => (
              <div key={p.a.id + p.b.id} className="border hairline p-6 bg-card/40">
                <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-primary">
                    ⏵ {p.reason}
                  </p>
                  <Button
                    onClick={() => keepBoth(p.a.id, p.b.id)}
                    variant="outline"
                    size="sm"
                    className="font-mono text-xs uppercase tracking-widest"
                  >
                    Keep both
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {[p.a, p.b].map((r) => (
                    <div key={r.id} className="space-y-3">
                      <div className="relative">
                        <ReferenceCard reference={r} />
                        <span
                          className={`absolute top-2 left-2 px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${
                            r.published
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {r.published ? "Published" : "Draft"}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {!r.published && (
                          <Button
                            size="sm"
                            variant="default"
                            disabled={busy === r.id}
                            onClick={() => publishOne(r.id)}
                            className="font-mono text-xs uppercase tracking-widest flex-1"
                            title="Keep this one and publish it"
                          >
                            <Check className="h-3.5 w-3.5 mr-2" /> Keep & publish
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy === r.id}
                          onClick={() => deleteOne(r.id)}
                          className={`font-mono text-xs uppercase tracking-widest ${r.published ? "flex-1" : ""}`}
                          title="Delete this reference"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                        </Button>
                      </div>
                    </div>
                  ))}
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

export default Doubletakes;
