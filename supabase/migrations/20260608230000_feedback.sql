create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('question', 'suggestion', 'bug')),
  message     text not null,
  email       text,
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- Logged-in users may only attach their own user_id and auth email;
-- anonymous submissions carry no user_id and no email (reply-to address,
-- if provided, is folded into the message text by the client).
create policy "submit feedback"
  on public.feedback for insert
  with check (
    (auth.uid() is not null
      and user_id = auth.uid()
      and (email is null or email = auth.email()))
    or
    (auth.uid() is null and user_id is null and email is null)
  );

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
