DROP POLICY "Users can submit drafts" ON public.references;
CREATE POLICY "Users can submit drafts" ON public.references
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND published = false
    AND approved_at IS NULL
    AND approved_by IS NULL
  );