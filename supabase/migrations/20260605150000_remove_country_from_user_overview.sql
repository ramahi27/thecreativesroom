-- Remove the country feature from the admin Users overview.
-- The previous version referenced page_views.country, a column that was
-- never created, so the admin Users page failed with
-- "column pv.country does not exist". This recreates the function without
-- any country reference. Time-on-site is kept (reads duration_seconds,
-- which does exist).
DROP FUNCTION IF EXISTS public.get_user_overview();

CREATE OR REPLACE FUNCTION public.get_user_overview()
 RETURNS TABLE(user_id uuid, email text, created_at timestamp with time zone, is_admin boolean, bookmarks_count integer, references_added integer, references_approved integer, time_spent_seconds bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::text,
    u.created_at,
    EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin') AS is_admin,
    COALESCE((SELECT COUNT(*)::int FROM public.bookmarks b WHERE b.user_id = u.id), 0) AS bookmarks_count,
    COALESCE((SELECT COUNT(*)::int FROM public.references r WHERE r.created_by = u.id AND r.published = true), 0) AS references_added,
    COALESCE((SELECT COUNT(*)::int FROM public.references r WHERE r.approved_by = u.id AND r.published = true), 0) AS references_approved,
    COALESCE((SELECT SUM(pv.duration_seconds)::bigint FROM public.page_views pv WHERE pv.user_id = u.id), 0) AS time_spent_seconds
  FROM auth.users u
  ORDER BY u.created_at DESC;
END;
$function$;
