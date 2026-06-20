GRANT SELECT ON public.references TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.references TO authenticated;
GRANT ALL ON public.references TO service_role;