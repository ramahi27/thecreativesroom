-- ================================================================
-- Close remaining scanner findings:
--   A. has_role: anonymous callers could enumerate admin accounts
--   B. folder_items: users could inject items into others' folders
--   C. feedback: tighten INSERT attribution (user_id + email)
--   D. profiles: re-assert scoped reads and no client UPDATE
-- Idempotent — safe to re-run in full.
-- ================================================================

-- ── A. has_role: block anonymous enumeration ──────────────────────
-- The previous guard only applied when auth.uid() IS NOT NULL, so
-- anonymous callers skipped it entirely and could probe any user ID.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid()
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
END;
$function$;

-- ── B. folder_items: inserts must target a folder you own ────────
-- (or a folder you collaborate on — that's the separate
-- "collaborators can add folder items" policy, which already checks
-- folder_members.)
DROP POLICY IF EXISTS "Users insert own folder items" ON public.folder_items;
CREATE POLICY "Users insert own folder items" ON public.folder_items
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.folders f
      WHERE f.id = folder_items.folder_id AND f.user_id = auth.uid()
    )
  );

-- ── C. feedback: strict attribution on INSERT ─────────────────────
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'feedback' AND schemaname = 'public'
      AND cmd IN ('INSERT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.feedback', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "submit feedback" ON public.feedback
  FOR INSERT WITH CHECK (
    (auth.uid() IS NOT NULL
      AND user_id = auth.uid()
      AND (email IS NULL OR email = auth.email()))
    OR
    (auth.uid() IS NULL AND user_id IS NULL AND email IS NULL)
  );

-- ── D. profiles: scoped reads, no client UPDATE ───────────────────
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'profiles' AND schemaname = 'public'
      AND cmd IN ('UPDATE', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

REVOKE UPDATE ON public.profiles FROM PUBLIC;
REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.profiles FROM anon;
GRANT ALL ON public.profiles TO service_role;

DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles readable" ON public.profiles;

CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Public profiles readable" ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (submissions_public = true);

-- Profile self-service writes go through this SECURITY DEFINER function:
-- creates the caller's row if missing (Welcome flow), otherwise updates
-- only the safe columns. plan is never touchable from the client.
CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_username           text    DEFAULT NULL,
  p_bio                text    DEFAULT NULL,
  p_avatar_url         text    DEFAULT NULL,
  p_submissions_public boolean DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  INSERT INTO public.profiles (user_id, username, bio, avatar_url, submissions_public)
  VALUES (auth.uid(), p_username, p_bio, p_avatar_url, COALESCE(p_submissions_public, true))
  ON CONFLICT (user_id) DO UPDATE SET
    username           = COALESCE(p_username,           profiles.username),
    bio                = COALESCE(p_bio,                profiles.bio),
    avatar_url         = COALESCE(p_avatar_url,         profiles.avatar_url),
    submissions_public = COALESCE(p_submissions_public, profiles.submissions_public),
    updated_at         = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_my_profile(text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text, text, boolean) TO authenticated;

-- Admin plan toggle (the admin UI can no longer UPDATE profiles directly).
CREATE OR REPLACE FUNCTION public.admin_set_plan(p_user_id uuid, p_plan text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_plan NOT IN ('free', 'paid') THEN
    RAISE EXCEPTION 'Invalid plan';
  END IF;
  UPDATE public.profiles SET plan = p_plan, updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_plan(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_plan(uuid, text) TO authenticated;
