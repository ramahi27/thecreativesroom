
CREATE TABLE public.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_folders_user ON public.folders(user_id);

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own folders" ON public.folders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own folders" ON public.folders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own folders" ON public.folders
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own folders" ON public.folders
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER folders_set_updated_at
  BEFORE UPDATE ON public.folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.folder_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  reference_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (folder_id, reference_id)
);

CREATE INDEX idx_folder_items_folder ON public.folder_items(folder_id);
CREATE INDEX idx_folder_items_user ON public.folder_items(user_id);
CREATE INDEX idx_folder_items_reference ON public.folder_items(reference_id);

ALTER TABLE public.folder_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own folder items" ON public.folder_items
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own folder items" ON public.folder_items
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own folder items" ON public.folder_items
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
