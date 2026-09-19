-- Extend task provenance and add owner-only iCalendar sync.
-- The private Radar rows were imported directly into production and are not stored in source control.

alter table public.tasks
  add column if not exists external_id text,
  add column if not exists priority_code text,
  add column if not exists workflow_status text not null default 'open',
  add column if not exists next_action text,
  add column if not exists evidence text,
  add column if not exists source text,
  add column if not exists owner_label text,
  add column if not exists last_checked date;

alter table public.tasks drop constraint if exists tasks_priority_code_check;
alter table public.tasks add constraint tasks_priority_code_check
  check (priority_code is null or priority_code in ('P0', 'P1', 'P2', 'P3', 'P4'));
alter table public.tasks drop constraint if exists tasks_workflow_status_check;
alter table public.tasks add constraint tasks_workflow_status_check
  check (workflow_status in ('open', 'waiting', 'backlog'));
drop index if exists public.tasks_user_external_id_idx;
create unique index tasks_user_external_id_idx on public.tasks (user_id, external_id);

alter table public.events
  add column if not exists end_date date,
  add column if not exists end_time text,
  add column if not exists all_day boolean not null default false,
  add column if not exists location text,
  add column if not exists external_id text,
  add column if not exists source text not null default 'manual',
  add column if not exists source_calendar text;

alter table public.events drop constraint if exists events_source_check;
alter table public.events add constraint events_source_check check (source in ('manual', 'ical'));
drop index if exists public.events_user_external_id_idx;
create unique index events_user_external_id_idx on public.events (user_id, external_id);

create table if not exists public.calendar_sync_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  feed_url text not null check (feed_url ~ '^https://'),
  calendar_name text not null default 'My calendar',
  enabled boolean not null default true,
  last_synced_at timestamptz,
  last_sync_status text not null default 'never' check (last_sync_status in ('never', 'success', 'error')),
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_sync_settings enable row level security;
drop policy if exists "Users can manage own calendar sync" on public.calendar_sync_settings;
create policy "Users can manage own calendar sync" on public.calendar_sync_settings
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop trigger if exists set_calendar_sync_updated_at on public.calendar_sync_settings;
create trigger set_calendar_sync_updated_at before update on public.calendar_sync_settings
  for each row execute function public.set_updated_at();
