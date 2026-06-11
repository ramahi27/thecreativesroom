
-- 1) Restrict profiles column access. The plan column is intentionally
-- excluded from the client grant — callers read their own plan via the
-- get_my_plan() SECURITY DEFINER function, so plan is never exposed by
-- querying another user's public profile row.
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (user_id, username, bio, avatar_url, created_at, updated_at, submissions_public)
  ON public.profiles TO anon, authenticated;
GRANT ALL ON public.profiles TO service_role;

-- 2) Fix get_my_folders IDOR + mutable search_path
CREATE OR REPLACE FUNCTION public.get_my_folders(p_user_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'folders', COALESCE((
      SELECT json_agg(f ORDER BY f.position ASC)
      FROM (
        SELECT id, name, color, position, is_public
        FROM public.folders
        WHERE user_id = auth.uid() AND user_id = p_user_id
      ) f
    ), '[]'::json),
    'items', COALESCE((
      SELECT json_agg(json_build_object('folder_id', folder_id, 'reference_id', reference_id))
      FROM public.folder_items
      WHERE user_id = auth.uid() AND user_id = p_user_id
    ), '[]'::json)
  );
$$;

-- 3) Explicit deny policies for brief_usages writes from client roles.
-- Edge functions use the service_role key which bypasses RLS.
DROP POLICY IF EXISTS "No client inserts on brief_usages" ON public.brief_usages;
DROP POLICY IF EXISTS "No client updates on brief_usages" ON public.brief_usages;
DROP POLICY IF EXISTS "No client deletes on brief_usages" ON public.brief_usages;

CREATE POLICY "No client inserts on brief_usages"
  ON public.brief_usages FOR INSERT TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "No client updates on brief_usages"
  ON public.brief_usages FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "No client deletes on brief_usages"
  ON public.brief_usages FOR DELETE TO anon, authenticated
  USING (false);
