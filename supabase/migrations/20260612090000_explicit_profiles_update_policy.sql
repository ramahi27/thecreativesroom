-- Replace the invisible REVOKE-only lockdown on profiles with an explicit
-- owner-scoped UPDATE policy plus a column-scoped UPDATE grant.
--
-- Net effect is identical to before — plan can never be written by a
-- client — but the protection is now visible as an RLS policy:
--   * RLS policy: users may update only their own row.
--   * Column grant: only username, bio, avatar_url, submissions_public
--     are writable. plan (and user_id) carry no UPDATE grant, so
--     "UPDATE profiles SET plan = 'paid'" fails with permission denied
--     before RLS is even consulted.
-- Idempotent — safe to re-run.

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

REVOKE UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (username, bio, avatar_url, submissions_public)
  ON public.profiles TO authenticated;

CREATE POLICY "Users update own profile safe columns" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
