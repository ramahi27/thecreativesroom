-- Enhance get_user_overview() to also return username and plan, so the admin
-- Users page can show usernames and the Free/Pro split. Reads username + plan
-- from profiles via a LEFT JOIN (SECURITY DEFINER, so RLS doesn't block it).
DROP FUNCTION IF EXISTS public.get_user_overview();

CREATE OR REPLACE FUNCTION public.get_user_overview()
 RETURNS TABLE(
   user_id uuid,
   email text,
   username text,
   plan text,
   created_at timestamp with time zone,
   is_admin boolean,
   bookmarks_count integer,
   references_added integer,
   references_approved integer,
   time_spent_seconds bigint
 )
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
    p.username,
    COALESCE(p.plan::text, 'free') AS plan,
    u.created_at,
    EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin') AS is_admin,
    COALESCE((SELECT COUNT(*)::int FROM public.bookmarks b WHERE b.user_id = u.id), 0) AS bookmarks_count,
    COALESCE((SELECT COUNT(*)::int FROM public.references r WHERE r.created_by = u.id AND r.published = true), 0) AS references_added,
    COALESCE((SELECT COUNT(*)::int FROM public.references r WHERE r.approved_by = u.id AND r.published = true), 0) AS references_approved,
    COALESCE((SELECT SUM(pv.duration_seconds)::bigint FROM public.page_views pv WHERE pv.user_id = u.id), 0) AS time_spent_seconds
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  ORDER BY u.created_at DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_user_overview() TO authenticated;
