-- The definitive_security_fix migration removed the plan column from the
-- client-readable column grant on profiles, which also blocks the admin
-- Users page from selecting it. Admins read plans through this guarded
-- SECURITY DEFINER function instead.
CREATE OR REPLACE FUNCTION public.admin_list_user_plans()
RETURNS TABLE(user_id uuid, plan text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT p.user_id, COALESCE(p.plan::text, 'free')
  FROM public.profiles p;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_user_plans() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_user_plans() TO authenticated;
