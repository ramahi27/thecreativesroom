-- Folder follows
CREATE TABLE public.folder_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(folder_id, user_id)
);

CREATE INDEX idx_folder_follows_user ON public.folder_follows(user_id);
CREATE INDEX idx_folder_follows_folder ON public.folder_follows(folder_id);

ALTER TABLE public.folder_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view follows"
  ON public.folder_follows FOR SELECT
  USING (true);

CREATE POLICY "Users can follow folders"
  ON public.folder_follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_folder_public(folder_id));

CREATE POLICY "Users can unfollow"
  ON public.folder_follows FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Drop display_name from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS display_name;

-- Refresh the profile RPC so it no longer references display_name
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