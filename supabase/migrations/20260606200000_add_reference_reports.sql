CREATE TABLE public.reference_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id UUID NOT NULL REFERENCES public.references(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  field       TEXT NOT NULL CHECK (field IN ('brand','agency','year','title','category','other')),
  message     TEXT NOT NULL CHECK (char_length(message) > 0 AND char_length(message) <= 500),
  resolved    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reference_reports ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a report (anon or authenticated)
CREATE POLICY "Anyone can submit a report"
  ON public.reference_reports FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Only admins can read or update reports
CREATE POLICY "Admins can read reports"
  ON public.reference_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update reports"
  ON public.reference_reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX reference_reports_reference_id_idx ON public.reference_reports (reference_id);
CREATE INDEX reference_reports_resolved_idx ON public.reference_reports (resolved);
