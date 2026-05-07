
CREATE TABLE public.duplicate_dismissals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ref_a_id uuid NOT NULL,
  ref_b_id uuid NOT NULL,
  dismissed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT duplicate_dismissals_pair_unique UNIQUE (ref_a_id, ref_b_id),
  CONSTRAINT duplicate_dismissals_ordered CHECK (ref_a_id < ref_b_id)
);

ALTER TABLE public.duplicate_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view dismissals" ON public.duplicate_dismissals
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert dismissals" ON public.duplicate_dismissals
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete dismissals" ON public.duplicate_dismissals
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
