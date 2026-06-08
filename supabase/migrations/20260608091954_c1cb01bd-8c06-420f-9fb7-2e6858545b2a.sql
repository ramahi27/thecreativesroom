-- Create reference_reports table for users to report issues with a reference
CREATE TABLE public.reference_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id uuid NOT NULL REFERENCES public.references(id) ON DELETE CASCADE,
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  field text NOT NULL,
  message text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reference_reports TO authenticated;
GRANT INSERT ON public.reference_reports TO anon;
GRANT ALL ON public.reference_reports TO service_role;

ALTER TABLE public.reference_reports ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous visitors) can submit a report
CREATE POLICY "Anyone can submit reports"
  ON public.reference_reports FOR INSERT
  WITH CHECK (true);

-- Only admins can view reports
CREATE POLICY "Admins can view reports"
  ON public.reference_reports FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can update (resolve) reports
CREATE POLICY "Admins can update reports"
  ON public.reference_reports FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete reports
CREATE POLICY "Admins can delete reports"
  ON public.reference_reports FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER reference_reports_set_updated_at
  BEFORE UPDATE ON public.reference_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add link-health tracking columns to references (used by check-links edge function and Logs page)
ALTER TABLE public.references
  ADD COLUMN IF NOT EXISTS link_status text,
  ADD COLUMN IF NOT EXISTS link_checked_at timestamptz;

CREATE INDEX IF NOT EXISTS references_link_status_idx
  ON public.references(link_status)
  WHERE link_status IS NOT NULL;
