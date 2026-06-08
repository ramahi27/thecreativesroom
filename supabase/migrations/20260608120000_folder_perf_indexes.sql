-- Speed up the two queries useFolders fires on every page load

-- folders: filter by user_id + order by position/created_at
create index if not exists folders_user_id_position_idx
  on folders (user_id, position asc, created_at asc);

-- folder_items: filter by user_id (the hot path for "what's in my folders")
create index if not exists folder_items_user_id_idx
  on folder_items (user_id);

-- RPC: return folders + items in a single round-trip
create or replace function get_my_folders(p_user_id uuid)
returns json
language sql
stable
security definer
as $$
  select json_build_object(
    'folders', coalesce((
      select json_agg(f order by f.position asc)
      from (
        select id, name, color, position, is_public
        from folders
        where user_id = p_user_id
      ) f
    ), '[]'::json),
    'items', coalesce((
      select json_agg(json_build_object('folder_id', folder_id, 'reference_id', reference_id))
      from folder_items
      where user_id = p_user_id
    ), '[]'::json)
  );
$$;
