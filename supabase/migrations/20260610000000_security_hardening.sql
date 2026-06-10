-- ================================================================
-- Security hardening: fix all 5 issues flagged by the security advisor
-- This migration is fully idempotent.
-- ================================================================

-- ── 1. Stripe credentials off profiles ───────────────────────────
-- Move to billing_customers (own-user read only, service_role writes).

CREATE TABLE IF NOT EXISTS public.billing_customers (
  user_id                uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id     text UNIQUE,
  stripe_subscription_id text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own billing" ON public.billing_customers;
CREATE POLICY "Users read own billing" ON public.billing_customers
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "No client writes on billing_customers" ON public.billing_customers;
CREATE POLICY "No client writes on billing_customers" ON public.billing_customers
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

GRANT ALL ON public.billing_customers TO service_role;

CREATE INDEX IF NOT EXISTS billing_customers_stripe_customer_id_idx
  ON public.billing_customers(stripe_customer_id);

-- Migrate any existing Stripe data from profiles before dropping columns.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'stripe_customer_id'
  ) THEN
    INSERT INTO public.billing_customers (user_id, stripe_customer_id, stripe_subscription_id)
    SELECT user_id, stripe_customer_id, stripe_subscription_id
    FROM public.profiles
    WHERE stripe_customer_id IS NOT NULL OR stripe_subscription_id IS NOT NULL
    ON CONFLICT (user_id) DO UPDATE
      SET stripe_customer_id     = EXCLUDED.stripe_customer_id,
          stripe_subscription_id = EXCLUDED.stripe_subscription_id;
  END IF;
END $$;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS stripe_customer_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS stripe_subscription_id;

-- ── 2. get_my_folders IDOR fix ────────────────────────────────────
-- Enforce caller identity: both conditions must hold so passing another
-- user's UUID as p_user_id returns an empty result set, not their data.

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

-- ── 3. brief_usages: remove IP-exposing admin policy ─────────────
-- Admins query via service_role (bypasses RLS) — no client policy needed.
-- Users may only read their own usage counter; anonymous rows (IP-only) are
-- never returned to any client role.

DROP POLICY IF EXISTS "Admins read brief_usages" ON public.brief_usages;

DROP POLICY IF EXISTS "Users read own brief_usages" ON public.brief_usages;
CREATE POLICY "Users read own brief_usages" ON public.brief_usages
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Block all client writes (edge functions use service_role).
DROP POLICY IF EXISTS "No client inserts on brief_usages" ON public.brief_usages;
DROP POLICY IF EXISTS "No client updates on brief_usages" ON public.brief_usages;
DROP POLICY IF EXISTS "No client deletes on brief_usages" ON public.brief_usages;

CREATE POLICY "No client inserts on brief_usages"
  ON public.brief_usages FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "No client updates on brief_usages"
  ON public.brief_usages FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "No client deletes on brief_usages"
  ON public.brief_usages FOR DELETE TO anon, authenticated USING (false);

-- ── 4. page_views: add user-scoped SELECT policy ─────────────────
-- Users may read their own view rows; the existing admin-only policy stays
-- for aggregate analytics.

DROP POLICY IF EXISTS "Users read own page views" ON public.page_views;
CREATE POLICY "Users read own page views" ON public.page_views
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

-- ── 5. set_updated_at: lock down search_path ─────────────────────
-- Prevents schema-injection attacks via a mutable search_path.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
