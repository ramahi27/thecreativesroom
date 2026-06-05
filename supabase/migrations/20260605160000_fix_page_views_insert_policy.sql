-- Fix page_views INSERT policy to prevent users from claiming arbitrary user_ids.
-- The previous policy used WITH CHECK (true), allowing any authenticated or
-- anonymous user to insert rows with any user_id UUID, inflating time-on-site
-- stats for other users on the admin Users page.
DROP POLICY IF EXISTS "Anyone can record page views" ON public.page_views;

CREATE POLICY "Anyone can record page views"
  ON public.page_views FOR INSERT
  TO anon, authenticated
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);
