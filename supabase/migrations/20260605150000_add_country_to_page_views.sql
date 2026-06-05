-- Add the missing country column to page_views.
-- The frontend (usePageView) inserts a `country` value and the
-- get_user_overview() admin function reads `pv.country`, but the column
-- was never created — causing both page-view tracking and the admin
-- Users page to fail with "column pv.country does not exist".
ALTER TABLE public.page_views ADD COLUMN IF NOT EXISTS country text;
