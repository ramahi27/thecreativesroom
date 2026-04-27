ALTER TABLE public.references ADD COLUMN IF NOT EXISTS source TEXT;
CREATE INDEX IF NOT EXISTS idx_references_source ON public.references(source);
-- Backfill existing imports from Deck of Brilliance (identified by source_url domain)
UPDATE public.references SET source = 'deckofbrilliance' WHERE source IS NULL AND source_url ILIKE '%deckofbrilliance%';
UPDATE public.references SET source = 'manual' WHERE source IS NULL;