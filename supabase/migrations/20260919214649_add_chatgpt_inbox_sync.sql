-- Store private, source-specific inbox snapshots populated by the ChatGPT
-- Gmail and Messages integrations. Connector credentials never reach the app.

alter table public.inbox_items
  add column if not exists external_id text,
  add column if not exists source_date timestamptz,
  add column if not exists source_url text,
  add column if not exists unread boolean not null default false;

drop index if exists public.inbox_items_user_source_idx;
create unique index inbox_items_user_source_idx
  on public.inbox_items (user_id, item_type, external_id)
  where external_id is not null;

create index if not exists inbox_items_user_source_date_idx
  on public.inbox_items (user_id, item_type, source_date desc);

create table if not exists public.inbox_sync_status (
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('imessage', 'gmail')),
  last_synced_at timestamptz,
  last_sync_status text not null default 'never' check (last_sync_status in ('never', 'success', 'error')),
  last_sync_error text,
  item_count integer not null default 0 check (item_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, source)
);

alter table public.inbox_sync_status enable row level security;
revoke all privileges on table public.inbox_sync_status from anon;
revoke insert, update, delete on table public.inbox_sync_status from authenticated;
grant select on table public.inbox_sync_status to authenticated;

drop policy if exists "Users can read own inbox sync status" on public.inbox_sync_status;
create policy "Users can read own inbox sync status" on public.inbox_sync_status
  for select to authenticated using ((select auth.uid()) = user_id);

drop trigger if exists set_inbox_sync_updated_at on public.inbox_sync_status;
create trigger set_inbox_sync_updated_at before update on public.inbox_sync_status
  for each row execute function public.set_updated_at();
;
