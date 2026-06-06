-- Per-IP daily rate limiting for the expand-search edge function.
-- Stores only a salted SHA-256 hash of the IP (never the raw address).
create table if not exists search_usages (
  id         uuid    primary key default gen_random_uuid(),
  ip_hash    text    not null,
  usage_date date    not null default current_date,
  count      integer not null default 0,
  constraint search_usages_ip_date unique (ip_hash, usage_date)
);

alter table search_usages enable row level security;

-- Only admins can read usage rows. The edge function uses the service role
-- key, which bypasses RLS, so no INSERT/UPDATE policy is needed for it.
create policy "Admins read search_usages" on search_usages
  for select using (
    exists (
      select 1 from user_roles
      where user_id = auth.uid() and role = 'admin'
    )
  );
