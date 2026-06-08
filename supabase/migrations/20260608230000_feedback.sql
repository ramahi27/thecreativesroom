create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('question', 'suggestion', 'bug')),
  message     text not null,
  email       text,
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- Anyone (including anonymous) can insert feedback
create policy "anyone can submit feedback"
  on public.feedback for insert
  with check (true);

-- Only admins can read feedback
create policy "admins can read feedback"
  on public.feedback for select
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Only admins can delete feedback
create policy "admins can delete feedback"
  on public.feedback for delete
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'admin'
    )
  );
