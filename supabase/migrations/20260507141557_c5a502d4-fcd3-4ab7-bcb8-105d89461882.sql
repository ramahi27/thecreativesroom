CREATE OR REPLACE FUNCTION public.rename_category(_old text, _new text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _old IS NULL OR _new IS NULL OR length(trim(_new)) = 0 THEN
    RAISE EXCEPTION 'Invalid arguments';
  END IF;
  UPDATE public."references"
  SET categories = (
    SELECT array_agg(DISTINCT CASE WHEN c = _old THEN _new ELSE c END)
    FROM unnest(categories) c
  )
  WHERE _old = ANY(categories);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;