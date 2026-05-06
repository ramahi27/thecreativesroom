ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS submissions_public boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.get_profile_by_username(_username text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'user_id', p.user_id,
    'username', p.username,
    'bio', p.bio,
    'avatar_url', p.avatar_url,
    'created_at', p.created_at,
    'submissions_public', p.submissions_public,
    'public_folders_count', (
      SELECT COUNT(*)::int FROM public.folders f
      WHERE f.user_id = p.user_id AND f.is_public = true
    ),
    'submitted_count', (
      SELECT COUNT(*)::int FROM public.references r
      WHERE r.created_by = p.user_id AND r.published = true
    )
  )
  INTO result
  FROM public.profiles p
  WHERE p.username = lower(_username)
  LIMIT 1;
  RETURN result;
END;
$function$;