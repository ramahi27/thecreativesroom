ALTER TABLE public.references ADD COLUMN IF NOT EXISTS visual_enriched_at timestamptz NULL;
CREATE INDEX IF NOT EXISTS references_visual_enriched_at_idx ON public.references (visual_enriched_at);