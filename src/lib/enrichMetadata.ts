// Shared helper to call the AI metadata function and backfill missing
// brand/agency/year (and merge tags) on a reference. Best-effort and silent.
import { supabase } from "@/integrations/supabase/client";

const AI_MARKER = "ai:processed";

function metadataToTags(m: any): string[] {
  const out: string[] = [AI_MARKER];
  if (Array.isArray(m?.tags)) {
    out.push(
      ...m.tags
        .map((t: string) => String(t).trim().toLowerCase())
        .filter(Boolean),
    );
  }
  return out;
}

export async function enrichReferenceMetadata(referenceId: string) {
  try {
    const { data: cur } = await supabase
      .from("references")
      .select("title,type,brand,agency,year,source_url,notes,tags,tag_synonyms,editing_style")
      .eq("id", referenceId)
      .maybeSingle();
    if (!cur?.title) return;

    const { data, error } = await supabase.functions.invoke(
      "generate-metadata",
      {
        body: {
          title: cur.title,
          type: (cur as any).type || null,
          brand: cur.brand || null,
          agency: cur.agency || null,
          year: cur.year || null,
          source_url: cur.source_url || null,
          notes: cur.notes || null,
        },
      },
    );
    const meta = (data as any)?.metadata;
    if (error || !meta) return;

    const newTags = metadataToTags(meta);
    const existing: string[] = Array.isArray(cur.tags) ? (cur.tags as string[]) : [];
    const merged = Array.from(new Set([...existing, ...newTags]));

    const newSyns: string[] = Array.isArray(meta.tag_synonyms)
      ? meta.tag_synonyms
          .map((t: string) => String(t).trim().toLowerCase())
          .filter(Boolean)
      : [];
    const existingSyns: string[] = Array.isArray((cur as any).tag_synonyms)
      ? ((cur as any).tag_synonyms as string[])
      : [];
    const tagSet = new Set(merged.map((t) => t.toLowerCase()));
    const mergedSyns = Array.from(
      new Set([...existingSyns, ...newSyns].filter((s) => !tagSet.has(s))),
    );

    const updates: {
      tags: string[];
      tag_synonyms: string[];
      brand?: string;
      agency?: string;
      year?: number;
    } = {
      tags: merged,
      tag_synonyms: mergedSyns,
    };
    if (!cur.brand && typeof meta.brand === "string" && meta.brand.trim()) {
      updates.brand = meta.brand.trim();
    }
    if (!cur.agency && typeof meta.agency === "string" && meta.agency.trim()) {
      updates.agency = meta.agency.trim();
    }
    if (!cur.year && Number.isInteger(meta.year)) {
      updates.year = meta.year;
    }
    await supabase.from("references").update(updates).eq("id", referenceId);
  } catch {
    /* best-effort */
  }
}
