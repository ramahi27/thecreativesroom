
-- Fix get_my_folders: enforce caller identity and set search_path
CREATE OR REPLACE FUNCTION public.get_my_folders(p_user_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'folders', COALESCE((
      SELECT json_agg(f ORDER BY f.position ASC)
      FROM (
        SELECT id, name, color, position, is_public
        FROM public.folders
        WHERE user_id = auth.uid() AND user_id = p_user_id
      ) f
    ), '[]'::json),
    'items', COALESCE((
      SELECT json_agg(json_build_object('folder_id', folder_id, 'reference_id', reference_id))
      FROM public.folder_items
      WHERE user_id = auth.uid() AND user_id = p_user_id
    ), '[]'::json)
  );
$$;

-- Drop Stripe columns from profiles (migrated to billing_customers)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS stripe_customer_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS stripe_subscription_id;
