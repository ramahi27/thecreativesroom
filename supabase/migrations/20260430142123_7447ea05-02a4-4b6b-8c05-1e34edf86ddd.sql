DROP POLICY IF EXISTS "Anyone can update their own view duration" ON public.page_views;

CREATE POLICY "Update recent views only"
  ON public.page_views FOR UPDATE
  TO anon, authenticated
  USING (created_at > now() - interval '30 minutes')
  WITH CHECK (created_at > now() - interval '30 minutes');