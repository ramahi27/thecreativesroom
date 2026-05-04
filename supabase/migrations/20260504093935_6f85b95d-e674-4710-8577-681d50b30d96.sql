
-- Add approval tracking
ALTER TABLE public.references
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;

-- Backfill: published rows without approval info — assume approved by their creator at created_at
UPDATE public.references
SET approved_at = COALESCE(approved_at, updated_at, created_at),
    approved_by = COALESCE(approved_by, created_by)
WHERE published = true AND approved_at IS NULL;

-- Trigger: when a reference becomes published, stamp approved_by/approved_at
CREATE OR REPLACE FUNCTION public.stamp_reference_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.published = true AND (OLD.published IS DISTINCT FROM true OR NEW.approved_at IS NULL) THEN
    NEW.approved_at := COALESCE(NEW.approved_at, now());
    NEW.approved_by := COALESCE(NEW.approved_by, auth.uid(), NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_reference_approval ON public.references;
CREATE TRIGGER trg_stamp_reference_approval
BEFORE INSERT OR UPDATE ON public.references
FOR EACH ROW
EXECUTE FUNCTION public.stamp_reference_approval();

-- Admin RPC: list published references with creator/approver emails
CREATE OR REPLACE FUNCTION public.get_reference_logs()
RETURNS TABLE(
  id uuid,
  title text,
  thumbnail_url text,
  brand text,
  type text,
  year integer,
  created_at timestamp with time zone,
  approved_at timestamp with time zone,
  created_by uuid,
  approved_by uuid,
  created_by_email text,
  approved_by_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
  SELECT r.id, r.title, r.thumbnail_url, r.brand, r.type, r.year,
         r.created_at, r.approved_at, r.created_by, r.approved_by,
         uc.email::text AS created_by_email,
         ua.email::text AS approved_by_email
  FROM public.references r
  LEFT JOIN auth.users uc ON uc.id = r.created_by
  LEFT JOIN auth.users ua ON ua.id = r.approved_by
  WHERE r.published = true
  ORDER BY COALESCE(r.approved_at, r.created_at) DESC;
END;
$$;
