-- ================================================================
-- Final security hardening: plan escalation, feedback attribution,
-- profile read scoping. Supersedes the policies created in
-- 20260506192947 (Users can update own profile) and earlier.
-- Idempotent — safe to re-run.
-- ================================================================

-- ── 1. Plan escalation: remove ALL UPDATE policies on profiles ────
-- Users edit their profile exclusively through the SECURITY DEFINER
-- function update_my_profile(), which writes only safe columns
-- (username, bio, avatar_url, submissions_public) scoped to
-- auth.uid(). The plan column is written only by the Stripe webhook
-- via service_role. With no UPDATE policy and no UPDATE grant,
-- direct PostgREST updates — including plan — are impossible.

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

CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_username           text    DEFAULT NULL,
  p_bio                text    DEFAULT NULL,
  p_avatar_url         text    DEFAULT NULL,
  p_submissions_public boolean DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles SET
    username           = COALESCE(p_username,           username),
    bio                = COALESCE(p_bio,                bio),
    avatar_url         = COALESCE(p_avatar_url,         avatar_url),
    submissions_public = COALESCE(p_submissions_public, submissions_public),
    updated_at         = now()
  WHERE user_id = auth.uid();
END;
$$;

-- ── 2. Feedback: user_id must be the caller's own ─────────────────
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

-- ── 3. Profile reads: own row always, others only when public ─────
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles readable" ON public.profiles;

CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Public profiles readable" ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (submissions_public = true);

-- plan is intentionally excluded — callers read their own via get_my_plan().
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (user_id, username, bio, avatar_url, created_at, updated_at, submissions_public)
  ON public.profiles TO anon, authenticated;
