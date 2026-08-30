-- Secure browser-accessible data at the database boundary.

alter table public.job_applications enable row level security;
revoke all privileges on table public.job_applications from anon, authenticated;

drop policy if exists "Users can read own tasks" on public.tasks;
drop policy if exists "Users can insert own tasks" on public.tasks;
drop policy if exists "Users can update own tasks" on public.tasks;
drop policy if exists "Users can delete own tasks" on public.tasks;
create policy "Users can read own tasks" on public.tasks for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own tasks" on public.tasks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own tasks" on public.tasks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own tasks" on public.tasks for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own bills" on public.bills;
drop policy if exists "Users can insert own bills" on public.bills;
drop policy if exists "Users can update own bills" on public.bills;
drop policy if exists "Users can delete own bills" on public.bills;
create policy "Users can read own bills" on public.bills for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own bills" on public.bills for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own bills" on public.bills for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own bills" on public.bills for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own events" on public.events;
drop policy if exists "Users can insert own events" on public.events;
drop policy if exists "Users can update own events" on public.events;
drop policy if exists "Users can delete own events" on public.events;
create policy "Users can read own events" on public.events for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own events" on public.events for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own events" on public.events for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own events" on public.events for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Service role full access" on public.inbox_items;
drop policy if exists "Users can view own inbox items" on public.inbox_items;
drop policy if exists "Users can insert own inbox items" on public.inbox_items;
drop policy if exists "Users can update own inbox items" on public.inbox_items;
drop policy if exists "Users can delete own inbox items" on public.inbox_items;
create policy "Users can view own inbox items" on public.inbox_items for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own inbox items" on public.inbox_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own inbox items" on public.inbox_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own inbox items" on public.inbox_items for delete to authenticated using ((select auth.uid()) = user_id);

create index if not exists tasks_user_id_idx on public.tasks (user_id);
create index if not exists bills_user_id_idx on public.bills (user_id);
create index if not exists events_user_id_idx on public.events (user_id);
create index if not exists inbox_items_user_id_idx on public.inbox_items (user_id);

alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.update_inbox_updated_at() set search_path = public, pg_temp;
