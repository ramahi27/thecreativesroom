-- Admin-managed list of collection pages hidden from the public.
-- Inserting a row "deletes" the corresponding /best-of/<slug> or
-- /agencies/<slug> page (it returns 404 for non-admins and drops from
-- the Best Of listing and sitemap).

create table if not exists public.hidden_collections (
  slug       text primary key,
  hidden_at  timestamptz not null default now(),
  hidden_by  uuid references auth.users(id) on delete set null
);

alter table public.hidden_collections enable row level security;

-- Anyone may read the list so the frontend and sitemap can filter pages.
create policy "Anyone can read hidden_collections"
  on public.hidden_collections
  for select
  using (true);

-- Only admins may hide pages.
create policy "Admins insert hidden_collections"
  on public.hidden_collections
  for insert
  to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

-- Only admins may restore (un-hide) pages.
create policy "Admins delete hidden_collections"
  on public.hidden_collections
  for delete
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));
