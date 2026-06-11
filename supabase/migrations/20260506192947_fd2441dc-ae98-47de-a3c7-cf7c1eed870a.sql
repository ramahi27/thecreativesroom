
-- 1. profiles table
CREATE TABLE public.profiles (
  user_id uuid NOT NULL PRIMARY KEY,
  username text NOT NULL UNIQUE,
  display_name text,
  bio text,
  avatar_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_-]{3,24}$'),
  CONSTRAINT bio_length CHECK (bio IS NULL OR char_length(bio) <= 200),
  CONSTRAINT display_name_length CHECK (display_name IS NULL OR char_length(display_name) <= 60)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Own row always readable; other profiles only when public.
CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Public profiles readable"
  ON public.profiles FOR SELECT TO anon, authenticated
  USING (submissions_public = true);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE policy: profile edits go through the SECURITY DEFINER
-- function update_my_profile() which writes only safe columns
-- (username, bio, avatar_url, submissions_public) scoped to auth.uid().
-- The plan column is written exclusively by the Stripe webhook via
-- service_role. Direct UPDATE is revoked from client roles.
REVOKE UPDATE ON public.profiles FROM PUBLIC, authenticated, anon;

CREATE POLICY "Users can delete own profile"
  ON public.profiles FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. folders.is_public
ALTER TABLE public.folders
  ADD COLUMN is_public boolean NOT NULL DEFAULT true;

CREATE POLICY "Anyone can view public folders"
  ON public.folders FOR SELECT
  USING (is_public = true);

-- 3. folder_items: allow viewing items inside public folders
CREATE OR REPLACE FUNCTION public.is_folder_public(_folder_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.folders WHERE id = _folder_id AND is_public = true);
$$;

CREATE POLICY "Anyone can view public folder items"
  ON public.folder_items FOR SELECT
  USING (public.is_folder_public(folder_id));

-- 4. helper RPCs
CREATE OR REPLACE FUNCTION public.username_available(_username text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = lower(_username));
$$;

CREATE OR REPLACE FUNCTION public.get_profile_by_username(_username text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'user_id', p.user_id,
    'username', p.username,
    'display_name', p.display_name,
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
$$;

-- 5. backfill profiles for existing users
INSERT INTO public.profiles (user_id, username, display_name)
SELECT
  u.id,
  -- derive a candidate username from the email local-part, sanitize, fall back to user-{n}
  COALESCE(
    NULLIF(regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9_-]', '', 'g'), ''),
    'user'
  )
  || CASE
       WHEN length(COALESCE(NULLIF(regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9_-]', '', 'g'), ''), 'user')) < 3
       THEN '-user'
       ELSE ''
     END
  || '-' || substr(u.id::text, 1, 6) AS username,
  split_part(u.email, '@', 1) AS display_name
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id);
