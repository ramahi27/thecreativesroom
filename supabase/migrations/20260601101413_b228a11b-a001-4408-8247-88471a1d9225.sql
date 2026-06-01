
CREATE TABLE public.pending_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL,
  image_url text,
  title text NOT NULL,
  brand text,
  agency text,
  category text,
  award_level text,
  year integer,
  format text,
  tags text[] NOT NULL DEFAULT '{}',
  curatorial_note text,
  status text NOT NULL DEFAULT 'draft',
  source text NOT NULL DEFAULT 'cannes-lions',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pending_refs_status_check CHECK (status IN ('draft','published','rejected'))
);

CREATE UNIQUE INDEX pending_refs_source_url_key ON public.pending_refs (source_url);
CREATE INDEX pending_refs_status_idx ON public.pending_refs (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_refs TO authenticated;
GRANT ALL ON public.pending_refs TO service_role;

ALTER TABLE public.pending_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view pending_refs" ON public.pending_refs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert pending_refs" ON public.pending_refs FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update pending_refs" ON public.pending_refs FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete pending_refs" ON public.pending_refs FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER pending_refs_updated_at BEFORE UPDATE ON public.pending_refs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
