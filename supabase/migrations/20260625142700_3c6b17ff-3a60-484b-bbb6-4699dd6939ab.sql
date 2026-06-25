ALTER TABLE public.references ADD COLUMN IF NOT EXISTS concept_summary text;
ALTER TABLE public.references ADD COLUMN IF NOT EXISTS concept_generated_at timestamptz;
CREATE INDEX IF NOT EXISTS references_concept_generated_at_idx ON public.references (concept_generated_at);
GRANT SELECT (concept_summary) ON public.references TO anon;