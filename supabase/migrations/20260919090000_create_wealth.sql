-- First-party Wealth data owned by Townsend OS.

create table if not exists public.wealth_import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  filename text not null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  dedup_strategy text not null default 'append' check (dedup_strategy in ('append', 'replace')),
  sheets_detected text[] not null default '{}',
  rows_imported integer not null default 0 check (rows_imported >= 0),
  rows_skipped integer not null default 0 check (rows_skipped >= 0),
  rows_deduplicated integer not null default 0 check (rows_deduplicated >= 0),
  rows_flagged integer not null default 0 check (rows_flagged >= 0),
  duplicate_candidates integer not null default 0 check (duplicate_candidates >= 0),
  recurring_imported integer not null default 0 check (recurring_imported >= 0),
  date_from date,
  date_to date,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wealth_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  import_batch_id uuid references public.wealth_import_batches(id) on delete set null,
  dedupe_key text not null,
  transaction_date date not null,
  description text not null,
  merchant_name text not null default 'Unknown',
  amount numeric(14,2) not null check (amount >= 0),
  direction text not null check (direction in ('debit', 'credit')),
  account_source text not null default 'Unknown',
  budget_category text not null default 'lifestyle' check (budget_category in ('living', 'lifestyle', 'investment', 'income')),
  category_name text not null default 'Uncategorised',
  subcategory text not null default '',
  transaction_type text not null check (transaction_type in ('expense', 'income', 'reimbursement', 'transfer', 'investment_property', 'subscription', 'one_off', 'excluded')),
  expense_class text not null default 'discretionary' check (expense_class in ('fixed', 'discretionary', 'investment_property', 'one_off', 'non_expense')),
  day_of_week text check (day_of_week is null or day_of_week in ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')),
  fortnight_index text,
  is_flagged boolean not null default false,
  flag_reason text not null default '',
  suggested_category text not null default '',
  suggestion_confidence text check (suggestion_confidence is null or suggestion_confidence in ('high', 'medium', 'low')),
  review_note text not null default '',
  is_duplicate_candidate boolean not null default false,
  is_excluded boolean not null default false,
  review_status text not null default 'pending' check (review_status in ('pending', 'confirmed', 'amended', 'excluded')),
  source_sheet text,
  source_row_number integer check (source_row_number is null or source_row_number >= 1),
  raw_row_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create table if not exists public.wealth_merchant_maps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  match_text text not null,
  merchant_name text not null,
  budget_category text not null default 'lifestyle' check (budget_category in ('living', 'lifestyle', 'investment', 'income')),
  category_name text not null,
  subcategory text not null default '',
  transaction_type text not null default 'expense' check (transaction_type in ('expense', 'income', 'reimbursement', 'transfer', 'investment_property', 'subscription', 'one_off', 'excluded')),
  expense_class text not null default 'discretionary' check (expense_class in ('fixed', 'discretionary', 'investment_property', 'one_off', 'non_expense')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_text)
);

create table if not exists public.wealth_recurring_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  fixed_cost_bucket text,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  frequency text not null default 'monthly' check (frequency in ('weekly', 'fortnightly', 'monthly', 'quarterly', 'annual', 'one_off')),
  frequency_days integer not null default 0 check (frequency_days >= 0),
  est_monthly numeric(14,2) not null default 0 check (est_monthly >= 0),
  annualised numeric(14,2) not null default 0 check (annualised >= 0),
  charges_seen integer not null default 0 check (charges_seen >= 0),
  last_charge_date date,
  next_charge_date date,
  category_name text,
  sample_description text,
  note text,
  status text not null default 'review' check (status in ('confirmed', 'review', 'cancel')),
  source_sheet text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.wealth_budget_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  budget_key text not null,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  category_name text not null,
  target_amount numeric(14,2) not null check (target_amount >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, budget_key)
);

create table if not exists public.wealth_audit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);

create index if not exists wealth_transactions_user_date_idx on public.wealth_transactions (user_id, transaction_date desc);
create index if not exists wealth_transactions_user_review_idx on public.wealth_transactions (user_id, review_status) where review_status <> 'confirmed';
create index if not exists wealth_transactions_user_category_idx on public.wealth_transactions (user_id, category_name, transaction_date desc);
create index if not exists wealth_import_batches_user_created_idx on public.wealth_import_batches (user_id, created_at desc);
create index if not exists wealth_recurring_bills_user_status_idx on public.wealth_recurring_bills (user_id, status);
create index if not exists wealth_budget_targets_user_month_idx on public.wealth_budget_targets (user_id, month);
create index if not exists wealth_audit_log_user_changed_idx on public.wealth_audit_log (user_id, changed_at desc);

alter table public.wealth_import_batches enable row level security;
alter table public.wealth_transactions enable row level security;
alter table public.wealth_merchant_maps enable row level security;
alter table public.wealth_recurring_bills enable row level security;
alter table public.wealth_budget_targets enable row level security;
alter table public.wealth_audit_log enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['wealth_import_batches', 'wealth_transactions', 'wealth_merchant_maps', 'wealth_recurring_bills', 'wealth_budget_targets']
  loop
    execute format('create policy "Users read own %1$s" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', table_name);
    execute format('create policy "Users insert own %1$s" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', table_name);
    execute format('create policy "Users update own %1$s" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name);
    execute format('create policy "Users delete own %1$s" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', table_name);
  end loop;
end $$;

create policy "Users read own wealth audit" on public.wealth_audit_log for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.audit_wealth_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_id uuid;
  entity_id text;
begin
  if tg_op = 'DELETE' then
    owner_id := old.user_id;
    entity_id := old.id::text;
  else
    owner_id := new.user_id;
    entity_id := new.id::text;
  end if;
  insert into public.wealth_audit_log (user_id, table_name, record_id, action, old_data, new_data)
  values (owner_id, tg_table_name, entity_id, tg_op, case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.audit_wealth_change() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['wealth_import_batches', 'wealth_transactions', 'wealth_merchant_maps', 'wealth_recurring_bills', 'wealth_budget_targets']
  loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', table_name);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_wealth_change()', table_name);
    execute format('drop trigger if exists set_%1$s_updated_at on public.%1$I', table_name);
    execute format('create trigger set_%1$s_updated_at before update on public.%1$I for each row execute function public.set_updated_at()', table_name);
  end loop;
end $$;

revoke insert, update, delete on public.wealth_audit_log from authenticated;
