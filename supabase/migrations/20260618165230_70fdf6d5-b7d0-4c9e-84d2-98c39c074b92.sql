
-- 1) Feedback: use has_role() instead of direct EXISTS, add explicit deny for non-admins
DROP POLICY IF EXISTS "admins can read feedback" ON public.feedback;
DROP POLICY IF EXISTS "Admins can read feedback" ON public.feedback;

CREATE POLICY "Admins can read feedback"
ON public.feedback
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 2) Profiles: restrict plan column visibility. Only the owner and admins can read it.
REVOKE SELECT (plan) ON public.profiles FROM anon, authenticated;
GRANT SELECT (plan) ON public.profiles TO service_role;

-- Provide column SELECT for own row + admins via a helper view? Simpler: keep a SECURITY DEFINER RPC.
-- The existing get_my_plan() already returns the user's own plan.
-- Admin path already uses admin_list_user_plans().
