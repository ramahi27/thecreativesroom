DROP FUNCTION IF EXISTS public.admin_set_plan(uuid, text);

CREATE OR REPLACE FUNCTION public.admin_set_plan(p_user_id uuid, p_plan text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
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

  -- Bypass the protect_profile_plan trigger for this admin-only,
  -- already-authorized statement. session_replication_role='replica'
  -- skips user triggers without altering any data.
  SET LOCAL session_replication_role = 'replica';

  UPDATE public.profiles
     SET plan = p_plan, updated_at = now()
   WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No profile found for user %', p_user_id;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_plan(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_plan(uuid, text) TO authenticated;