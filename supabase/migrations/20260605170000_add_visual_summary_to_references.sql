-- Add visual_summary column for AI-generated visual descriptions used by brief matching
ALTER TABLE public.references
  ADD COLUMN IF NOT EXISTS visual_summary text;
