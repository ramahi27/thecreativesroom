CREATE OR REPLACE FUNCTION public.get_my_folders(p_user_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id
      THEN json_build_object('folders', '[]'::json, 'items', '[]'::json)
    ELSE json_build_object(
      'folders', coalesce((
        SELECT json_agg(f ORDER BY f.position ASC)
        FROM (SELECT id, name, color, position, is_public FROM public.folders WHERE user_id = p_user_id) f
      ), '[]'::json),
      'items', coalesce((
        SELECT json_agg(json_build_object('folder_id', folder_id, 'reference_id', reference_id))
        FROM public.folder_items WHERE user_id = p_user_id
      ), '[]'::json)
    )
  END;
$$;