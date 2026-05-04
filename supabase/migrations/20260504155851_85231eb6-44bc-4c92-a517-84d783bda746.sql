
CREATE OR REPLACE FUNCTION public.get_user_overview()
RETURNS TABLE(
  user_id uuid,
  email text,
  created_at timestamp with time zone,
  is_admin boolean,
  bookmarks_count integer,
  references_added integer,
  references_approved integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    COALESCE((SELECT COUNT(*)::int FROM public.references r WHERE r.approved_by = u.id AND r.published = true), 0) AS references_approved
  FROM auth.users u
  ORDER BY u.created_at DESC;
END;
$$;
