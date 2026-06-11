
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- IS DISTINCT FROM covers anonymous callers (auth.uid() IS NULL) too.
  IF _user_id IS DISTINCT FROM auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
     )
  THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
END;
$$;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- References table
CREATE TABLE public.references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('image','video','link')),
  media_url TEXT,
  source_url TEXT,
  thumbnail_url TEXT,
  brand TEXT,
  agency TEXT,
  year INT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view references"
  ON public.references FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert references"
  ON public.references FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update references"
  ON public.references FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete references"
  ON public.references FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER references_updated_at
  BEFORE UPDATE ON public.references
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('references', 'references', true);

CREATE POLICY "Public can view reference media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'references');

CREATE POLICY "Admins can upload reference media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'references' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update reference media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'references' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete reference media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'references' AND public.has_role(auth.uid(), 'admin'));
