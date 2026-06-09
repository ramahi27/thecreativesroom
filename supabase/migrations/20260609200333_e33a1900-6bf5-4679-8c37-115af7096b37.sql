create table public.folder_members (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.folders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (folder_id, user_id)
);

grant select, insert, update, delete on public.folder_members to authenticated;
grant all on public.folder_members to service_role;

alter table public.folder_members enable row level security;

create policy "folder owner manages members"
  on public.folder_members for all
  using (exists (select 1 from public.folders where id = folder_members.folder_id and user_id = auth.uid()))
  with check (exists (select 1 from public.folders where id = folder_members.folder_id and user_id = auth.uid()));

create policy "collaborators can read own memberships"
  on public.folder_members for select
  using (user_id = auth.uid());

create policy "collaborators can add folder items"
  on public.folder_items for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.folder_members where folder_id = folder_items.folder_id and user_id = auth.uid())
  );

create policy "collaborators can remove their folder items"
  on public.folder_items for delete
  using (
    user_id = auth.uid()
    and exists (select 1 from public.folder_members where folder_id = folder_items.folder_id and user_id = auth.uid())
  );

create policy "collaborators can read folder items"
  on public.folder_items for select
  using (exists (select 1 from public.folder_members where folder_id = folder_items.folder_id and user_id = auth.uid()));