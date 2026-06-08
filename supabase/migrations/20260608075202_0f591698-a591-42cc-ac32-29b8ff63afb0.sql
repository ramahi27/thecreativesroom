CREATE TABLE IF NOT EXISTS public.search_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  usage_date date NOT NULL DEFAULT (now()::date),
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ip_hash, usage_date)
);

GRANT ALL ON public.search_usages TO service_role;

ALTER TABLE public.search_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read search_usages"
  ON public.search_usages FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_updated_at_search_usages
  BEFORE UPDATE ON public.search_usages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();