alter table profiles add column if not exists stripe_customer_id text;
alter table profiles add column if not exists stripe_subscription_id text;

-- Index for webhook lookups by customer id
create index if not exists profiles_stripe_customer_id_idx on profiles(stripe_customer_id);
