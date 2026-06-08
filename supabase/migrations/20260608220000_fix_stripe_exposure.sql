-- Drop Stripe columns that were mistakenly re-added to profiles.
-- Canonical location is billing_customers (service-role only, own-user readable).
ALTER TABLE public.profiles DROP COLUMN IF EXISTS stripe_customer_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS stripe_subscription_id;

-- Ensure billing_customers exists with strict access.
-- Authenticated users may only read their own row; all writes go through service role.
CREATE TABLE IF NOT EXISTS public.billing_customers (
  user_id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id  text UNIQUE,
  stripe_subscription_id text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;

-- Only the owning user can read their billing row.
DROP POLICY IF EXISTS "Users read own billing" ON public.billing_customers;
CREATE POLICY "Users read own billing" ON public.billing_customers
  FOR SELECT USING (auth.uid() = user_id);

-- No INSERT / UPDATE / DELETE for anon or authenticated — only service_role.
DROP POLICY IF EXISTS "No client writes on billing_customers" ON public.billing_customers;
CREATE POLICY "No client writes on billing_customers" ON public.billing_customers
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

GRANT ALL ON public.billing_customers TO service_role;

CREATE INDEX IF NOT EXISTS billing_customers_stripe_customer_id_idx
  ON public.billing_customers(stripe_customer_id);
