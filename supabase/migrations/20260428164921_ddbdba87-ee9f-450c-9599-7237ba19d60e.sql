CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read settings" ON public.app_settings
FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins can insert settings" ON public.app_settings
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update settings" ON public.app_settings
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete settings" ON public.app_settings
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed with current default categories
INSERT INTO public.app_settings (key, value) VALUES
  ('video_categories', '["Commercials","Promos / Trailers","Case Studies","Social Content"]'::jsonb),
  ('photo_categories', '["Campaign","Branding","Copy Driven"]'::jsonb);