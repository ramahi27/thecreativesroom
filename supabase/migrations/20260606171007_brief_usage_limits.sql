-- Add plan tier to profiles (free / paid)
alter table profiles
  add column if not exists plan text not null default 'free'
  check (plan in ('free', 'paid'));

-- Track daily brief usage per user or anonymous IP
create table if not exists brief_usages (
  id           uuid    primary key default gen_random_uuid(),
  user_id      uuid    references auth.users(id) on delete cascade,
  ip_address   text,
  usage_date   date    not null default current_date,
  count        integer not null default 0,
  -- only one row per user per day, or one row per IP per day (for anon)
  constraint brief_usages_user_date unique (user_id, usage_date),
  constraint brief_usages_ip_date   unique (ip_address, usage_date),
  constraint brief_usages_must_have_owner check (
    user_id is not null or ip_address is not null
  )
);

alter table brief_usages enable row level security;

-- Admins can read all usage rows
create policy "Admins read brief_usages" on brief_usages
  for select using (
    exists (
      select 1 from user_roles
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Service role (used by edge function) bypasses RLS automatically.
