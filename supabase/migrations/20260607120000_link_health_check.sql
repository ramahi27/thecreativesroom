-- Track broken/dead links on references
alter table references
  add column if not exists link_status text default 'unchecked'
    check (link_status in ('unchecked', 'ok', 'dead', 'error')),
  add column if not exists link_checked_at timestamptz;

create index if not exists references_link_status_idx on references (link_status);
create index if not exists references_link_checked_at_idx on references (link_checked_at nulls first);
