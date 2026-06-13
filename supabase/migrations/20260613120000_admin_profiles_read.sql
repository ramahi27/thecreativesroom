-- Allow admins to read all profile rows (needed for the admin Users page).
-- Regular users are still restricted to their own row + public rows by the
-- existing "Users read own profile" and "Public profiles readable" policies.
CREATE POLICY "Admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Grant admins (and all authenticated users) access to the plan column.
-- RLS already limits which rows each role can see, so this doesn't expose
-- other users' plans to non-admin authenticated users — they can only read
-- rows they're permitted to access (own row + public rows).
GRANT SELECT (plan) ON public.profiles TO authenticated;
