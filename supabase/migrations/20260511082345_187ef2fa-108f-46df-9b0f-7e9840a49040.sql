
-- 1) folder_items: hide user_id from public/anon while keeping needed columns
REVOKE SELECT ON public.folder_items FROM anon, authenticated;
GRANT SELECT (id, folder_id, reference_id, created_at) ON public.folder_items TO anon;
GRANT SELECT (id, folder_id, reference_id, created_at, user_id) ON public.folder_items TO authenticated;

-- 2) folder_follows: restrict SELECT
DROP POLICY IF EXISTS "Authenticated can view follows" ON public.folder_follows;

CREATE POLICY "Users view own follows"
ON public.folder_follows
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Folder owners view their followers"
ON public.folder_follows
FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.folders f WHERE f.id = folder_follows.folder_id AND f.user_id = auth.uid()));

CREATE POLICY "Admins view all follows"
ON public.folder_follows
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
