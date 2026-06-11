
-- Profiles SELECT: own row always, other rows only when public.
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles readable" ON public.profiles;

CREATE POLICY "Users read own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Public profiles readable"
ON public.profiles FOR SELECT TO anon, authenticated
USING (submissions_public = true);

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
