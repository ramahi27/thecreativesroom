-- Page views table
CREATE TABLE public.page_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id text NOT NULL,
  user_id uuid,
  path text NOT NULL,
  reference_id uuid,
  duration_seconds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_page_views_visitor ON public.page_views(visitor_id);
CREATE INDEX idx_page_views_reference ON public.page_views(reference_id);
CREATE INDEX idx_page_views_created ON public.page_views(created_at DESC);

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

-- Anyone can insert their own view
CREATE POLICY "Anyone can record page views"
  ON public.page_views FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Anyone can update their own view (to set duration on unload)
CREATE POLICY "Anyone can update their own view duration"
  ON public.page_views FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Only admins can read
CREATE POLICY "Admins can read all page views"
  ON public.page_views FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Admin stats function
CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jsonb_build_object(
    'total_visitors', (SELECT COUNT(DISTINCT visitor_id) FROM page_views),
    'visitors_7d', (SELECT COUNT(DISTINCT visitor_id) FROM page_views WHERE created_at > now() - interval '7 days'),
    'visitors_30d', (SELECT COUNT(DISTINCT visitor_id) FROM page_views WHERE created_at > now() - interval '30 days'),
    'total_views', (SELECT COUNT(*) FROM page_views),
    'views_7d', (SELECT COUNT(*) FROM page_views WHERE created_at > now() - interval '7 days'),
    'registered_accounts', (SELECT COUNT(*) FROM auth.users),
    'accounts_7d', (SELECT COUNT(*) FROM auth.users WHERE created_at > now() - interval '7 days'),
    'total_references', (SELECT COUNT(*) FROM "references" WHERE published = true),
    'total_bookmarks', (SELECT COUNT(*) FROM bookmarks),
    'avg_session_seconds', COALESCE((
      SELECT ROUND(AVG(total)::numeric, 1) FROM (
        SELECT visitor_id, SUM(duration_seconds) AS total
        FROM page_views
        WHERE duration_seconds > 0
        GROUP BY visitor_id, date_trunc('hour', created_at)
      ) s
    ), 0),
    'avg_view_seconds', COALESCE((SELECT ROUND(AVG(duration_seconds)::numeric, 1) FROM page_views WHERE duration_seconds > 0), 0),
    'top_visited', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT r.id, r.title, r.thumbnail_url, r.brand,
               COUNT(pv.id)::int AS views,
               COUNT(DISTINCT pv.visitor_id)::int AS unique_visitors,
               COALESCE(ROUND(AVG(NULLIF(pv.duration_seconds, 0))::numeric, 1), 0) AS avg_seconds
        FROM page_views pv
        JOIN "references" r ON r.id = pv.reference_id
        WHERE pv.reference_id IS NOT NULL
        GROUP BY r.id, r.title, r.thumbnail_url, r.brand
        ORDER BY views DESC
        LIMIT 10
      ) t
    ),
    'top_bookmarked', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
        SELECT r.id, r.title, r.thumbnail_url, r.brand, COUNT(b.id)::int AS bookmark_count
        FROM bookmarks b
        JOIN "references" r ON r.id = b.reference_id
        GROUP BY r.id, r.title, r.thumbnail_url, r.brand
        ORDER BY bookmark_count DESC
        LIMIT 10
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$;