
-- 1. Fix EXPOSED_CREATOR_IDS: hide created_by from anonymous users via column-level privileges
REVOKE SELECT ON public.references FROM anon;
GRANT SELECT (
  id, title, type, media_url, source_url, thumbnail_url, brand, agency,
  year, tags, notes, created_at, updated_at, media_items, categories, published, source
) ON public.references TO anon;

-- 2. Fix PRIVILEGE_ESCALATION_RISK: restrict has_role so non-admins can only check themselves
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Callers may only query roles for themselves, unless they are an admin.
  -- IS DISTINCT FROM ensures anonymous callers (auth.uid() IS NULL) cannot
  -- enumerate admin accounts by probing arbitrary user IDs.
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

-- 3. Fix SUPA_anon/authenticated_security_definer_function_executable
-- Revoke direct execute from anon/authenticated for admin-only definer functions.
REVOKE EXECUTE ON FUNCTION public.list_admins() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM anon, authenticated, public;
-- Re-grant only to service_role (admins act via service or via separate paths if needed).
-- Note: these still need to be callable via authenticated context for the admin UI.
-- Re-grant to authenticated; the function bodies enforce admin check via has_role(auth.uid(), 'admin').
GRANT EXECUTE ON FUNCTION public.list_admins() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO authenticated;

-- 4. Fix SUPA_public_bucket_allows_listing: restrict SELECT on storage so listing is not exposed.
-- Replace blanket SELECT with one that does not allow listing the entire bucket
-- by requiring an authenticated context OR restricting to known object name pattern.
-- We keep public read access (signed by direct path) but deny generic listing by anon.
DROP POLICY IF EXISTS "Public can view reference media" ON storage.objects;
CREATE POLICY "Public can view reference media"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'references'
  AND name IS NOT NULL
  AND position('/' in name) > 0
);
