
-- Restrict profiles SELECT to authenticated; anon should use get_profile_by_username RPC
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
CREATE POLICY "Authenticated can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Restrict folder_follows SELECT to authenticated to avoid leaking follower UUIDs to anon
DROP POLICY IF EXISTS "Anyone can view follows" ON public.folder_follows;
CREATE POLICY "Authenticated can view follows"
ON public.folder_follows
FOR SELECT
TO authenticated
USING (true);

-- Lock down page_views UPDATE so users can only update their own recent views
DROP POLICY IF EXISTS "Update recent views only" ON public.page_views;
CREATE POLICY "Users update own recent views"
ON public.page_views
FOR UPDATE
TO authenticated
USING (created_at > (now() - interval '30 minutes') AND auth.uid() IS NOT NULL AND auth.uid() = user_id)
WITH CHECK (created_at > (now() - interval '30 minutes') AND auth.uid() IS NOT NULL AND auth.uid() = user_id);
