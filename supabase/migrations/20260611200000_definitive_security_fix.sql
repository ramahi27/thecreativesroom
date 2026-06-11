-- ================================================================
-- DEFINITIVE security hardening — fixes every scanner finding.
-- Idempotent. Run this once in the Supabase SQL editor.
-- ================================================================

-- ── 1. Profiles: kill every UPDATE path from client roles ─────────
-- Drop ALL UPDATE/ALL policies regardless of name (loop catches any
-- policy created by previous migrations or manual SQL runs).
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

-- ── 2. Profiles: scoped SELECT (own row + public rows only) ───────
-- Drop every possible name the open SELECT policy might have.
DROP POLICY IF EXISTS "Anyone can view profiles"           ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users read own profile"             ON public.profiles;
DROP POLICY IF EXISTS "Public profiles readable"           ON public.profiles;

CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Public profiles readable" ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (submissions_public = true);

-- ── 3. Profiles: hide plan column from public queries ─────────────
-- plan is readable only via the get_my_plan() SECURITY DEFINER
-- function below, so it cannot be seen by querying another user's
-- public profile row.
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (user_id, username, bio, avatar_url, created_at, updated_at, submissions_public)
  ON public.profiles TO anon, authenticated;
-- (plan is intentionally NOT in this list — use get_my_plan() instead)

-- ── 4. get_my_plan(): caller reads only their own plan ───────────
CREATE OR REPLACE FUNCTION public.get_my_plan()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(plan::text, 'free')
  FROM public.profiles
  WHERE user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_plan() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_plan() TO authenticated;

-- ── 5. check_pro_access(): single boolean used by the Worker ─────
CREATE OR REPLACE FUNCTION public.check_pro_access()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND plan = 'paid'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_pro_access() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.check_pro_access() TO authenticated;

-- ── 6. update_my_profile(): upsert safe columns only ─────────────
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
GRANT  EXECUTE ON FUNCTION public.update_my_profile(text, text, text, boolean) TO authenticated;

-- ── 7. admin_set_plan(): plan changes via admin RPC only ──────────
CREATE OR REPLACE FUNCTION public.admin_set_plan(p_user_id uuid, p_plan text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_plan NOT IN ('free', 'paid') THEN
    RAISE EXCEPTION 'Invalid plan value';
  END IF;
  UPDATE public.profiles
  SET plan = p_plan, updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_plan(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_plan(uuid, text) TO authenticated;

-- ── 8. has_role(): block anonymous enumeration ────────────────────
-- Use IS DISTINCT FROM so that anon callers (auth.uid() IS NULL)
-- are also blocked from probing arbitrary user IDs.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = auth.uid() AND role = 'admin'
     )
  THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$function$;

-- ── 9. folder_items: must own the target folder ───────────────────
DROP POLICY IF EXISTS "Users insert own folder items" ON public.folder_items;
CREATE POLICY "Users insert own folder items" ON public.folder_items
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.folders f
      WHERE f.id = folder_items.folder_id AND f.user_id = auth.uid()
    )
  );

-- ── 10. feedback: strict attribution, no anon email storage ───────
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

-- Logged-in: user_id must be caller, email must match auth.email() or be null.
-- Anonymous: user_id must be null AND email must be null
--   (reply-to address is folded into the message text by the client).
CREATE POLICY "submit feedback" ON public.feedback
  FOR INSERT WITH CHECK (
    (auth.uid() IS NOT NULL
      AND user_id = auth.uid()
      AND (email IS NULL OR email = auth.email()))
    OR
    (auth.uid() IS NULL AND user_id IS NULL AND email IS NULL)
  );
