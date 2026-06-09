-- Folder collaboration: allow owners to invite other users to edit a folder
create table public.folder_members (
  id          uuid primary key default gen_random_uuid(),
  folder_id   uuid not null references public.folders(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  invited_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (folder_id, user_id)
);

alter table public.folder_members enable row level security;

-- Folder owner can read, insert, and delete members
create policy "folder owner manages members"
  on public.folder_members
  for all
  using (
    exists (
      select 1 from public.folders
      where id = folder_members.folder_id
        and user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.folders
      where id = folder_members.folder_id
        and user_id = auth.uid()
    )
  );

-- Collaborators can read their own memberships (so they can see which folders they have access to)
create policy "collaborators can read own memberships"
  on public.folder_members for select
  using (user_id = auth.uid());

-- Allow collaborators to add items to folders they're members of
create policy "collaborators can add folder items"
  on public.folder_items for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.folder_members
      where folder_id = folder_items.folder_id
        and user_id = auth.uid()
    )
  );

-- Allow collaborators to remove items they added from shared folders
create policy "collaborators can remove their folder items"
  on public.folder_items for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.folder_members
      where folder_id = folder_items.folder_id
        and user_id = auth.uid()
    )
  );

-- Allow collaborators to read folder_items for folders they're members of
create policy "collaborators can read folder items"
  on public.folder_items for select
  using (
    exists (
      select 1 from public.folder_members
      where folder_id = folder_items.folder_id
        and user_id = auth.uid()
    )
  );
