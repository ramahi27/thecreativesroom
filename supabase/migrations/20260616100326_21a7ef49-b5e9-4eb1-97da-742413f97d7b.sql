
-- 1. Block anonymous enumeration via has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF _user_id <> auth.uid()
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
END;
$$;

-- 2. Explicit UPDATE policy on profiles
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Trigger that blocks plan self-upgrade. service_role / admin functions run
-- without auth.uid(), so they continue to update the column freely.
CREATE OR REPLACE FUNCTION public.prevent_profile_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'plan cannot be changed by the user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_plan ON public.profiles;
CREATE TRIGGER protect_profile_plan
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_plan_change();

-- 4. Hide plan column from anon/authenticated SELECTs. service_role keeps full access.
REVOKE SELECT (plan) ON public.profiles FROM anon, authenticated, PUBLIC;
REVOKE UPDATE (plan) ON public.profiles FROM anon, authenticated, PUBLIC;
GRANT SELECT (user_id, username, bio, avatar_url, created_at, updated_at, submissions_public)
  ON public.profiles TO anon, authenticated;
GRANT UPDATE (username, bio, avatar_url, submissions_public)
  ON public.profiles TO authenticated;
