-- Add published flag (default true so existing items remain visible)
ALTER TABLE public.references
ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_references_published ON public.references(published);

-- Replace public select policy: only published items for the public
DROP POLICY IF EXISTS "Anyone can view references" ON public.references;

CREATE POLICY "Anyone can view published references"
ON public.references
FOR SELECT
TO public
USING (published = true);

-- Admins can view everything (including drafts)
CREATE POLICY "Admins can view all references"
ON public.references
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
