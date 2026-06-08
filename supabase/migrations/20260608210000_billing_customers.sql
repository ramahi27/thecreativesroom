create table if not exists billing_customers (
  user_id uuid primary key references profiles(user_id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Only the user and service role can read billing data
alter table billing_customers enable row level security;

create policy "Users read own billing" on billing_customers
  for select using (auth.uid() = user_id);

create index if not exists billing_customers_stripe_customer_id_idx
  on billing_customers(stripe_customer_id);
