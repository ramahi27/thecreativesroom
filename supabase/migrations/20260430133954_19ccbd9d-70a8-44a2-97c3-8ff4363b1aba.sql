-- Allow authenticated users to submit references as drafts (they become "creator")
-- They can only insert rows where created_by = auth.uid() AND published = false.
CREATE POLICY "Users can submit drafts"
ON public.references
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND published = false
);

-- Allow users to view their own references (drafts included) so they appear in My Collection
CREATE POLICY "Users can view their own references"
ON public.references
FOR SELECT
TO authenticated
USING (auth.uid() = created_by);
