-- SECURITY DEFINER function so admins can read all profiles (including plan)
-- without loosening RLS policies. The function checks admin role server-side.
CREATE OR REPLACE FUNCTION public.admin_get_profiles()
RETURNS TABLE (
  user_id  uuid,
  username text,
  created_at timestamptz,
  plan     text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caller must be an admin
  IF NOT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
    SELECT p.user_id, p.username, p.created_at, p.plan::text
    FROM profiles p;
END;
$$;

-- Only authenticated users may call this; the internal check gates non-admins
REVOKE ALL ON FUNCTION public.admin_get_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_profiles() TO authenticated;
