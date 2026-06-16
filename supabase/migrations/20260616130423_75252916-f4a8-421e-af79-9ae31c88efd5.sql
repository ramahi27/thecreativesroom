
-- 1. reference_reports INSERT: require authenticated + reporter_id matches caller (or null)
DROP POLICY IF EXISTS "Anyone can submit reports" ON public.reference_reports;
CREATE POLICY "Authenticated users can submit reports"
ON public.reference_reports
FOR INSERT
TO authenticated
WITH CHECK (reporter_id IS NULL OR reporter_id = auth.uid());

-- 2. folder_members SELECT: scope to authenticated role only
DROP POLICY IF EXISTS "collaborators can read own memberships" ON public.folder_members;
CREATE POLICY "collaborators can read own memberships"
ON public.folder_members
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 3. Server-side source_url validation: only http/https allowed
CREATE OR REPLACE FUNCTION public.validate_reference_source_url()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.source_url IS NOT NULL
     AND NEW.source_url <> ''
     AND NEW.source_url !~* '^https?://'
  THEN
    RAISE EXCEPTION 'source_url must start with http:// or https://';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_reference_source_url_trg ON public.references;
CREATE TRIGGER validate_reference_source_url_trg
BEFORE INSERT OR UPDATE OF source_url ON public.references
FOR EACH ROW
EXECUTE FUNCTION public.validate_reference_source_url();

-- Same guard for the pending_refs staging table
DROP TRIGGER IF EXISTS validate_pending_refs_source_url_trg ON public.pending_refs;
CREATE TRIGGER validate_pending_refs_source_url_trg
BEFORE INSERT OR UPDATE OF source_url ON public.pending_refs
FOR EACH ROW
EXECUTE FUNCTION public.validate_reference_source_url();
