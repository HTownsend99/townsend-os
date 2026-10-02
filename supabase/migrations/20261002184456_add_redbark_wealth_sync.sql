-- Redbark delivery metadata contains no bank transaction content.
create table public.wealth_redbark_deliveries (
  delivery_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  received_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.wealth_redbark_deliveries enable row level security;
revoke all on public.wealth_redbark_deliveries from public, anon, authenticated;
grant select, insert, update on public.wealth_redbark_deliveries to service_role;

create or replace function public.ingest_redbark_transactions(
  p_owner uuid,
  p_delivery_id uuid,
  p_rows jsonb
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  merchant_map public.wealth_merchant_maps%rowtype;
  transaction_key text;
  existing_id uuid;
  inserted integer := 0;
  updated integer := 0;
  skipped integer := 0;
  date_value date;
  description_value text;
  merchant_value text;
  amount_value numeric(14,2);
  direction_value text;
  account_value text;
  budget_value text;
  category_value text;
  type_value text;
  class_value text;
  cutoff date := ((now() at time zone 'Australia/Sydney')::date - interval '12 months')::date;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Invalid Redbark batch';
  end if;

  insert into public.wealth_redbark_deliveries (delivery_id, user_id)
  values (p_delivery_id, p_owner) on conflict do nothing;
  if not found then
    return jsonb_build_object('already_processed', true);
  end if;

  for item in select value from jsonb_array_elements(p_rows)
  loop
    transaction_key := item->>'dedupe_key';
    date_value := (item->>'transaction_date')::date;
    description_value := item->>'description';
    merchant_value := coalesce(nullif(item->>'merchant_name', ''), 'Unknown');
    amount_value := (item->>'amount')::numeric;
    direction_value := item->>'direction';
    account_value := item->>'account_source';

    if date_value < cutoff then
      skipped := skipped + 1;
      continue;
    end if;

    select id into existing_id from public.wealth_transactions
      where user_id = p_owner and dedupe_key = transaction_key;
    if existing_id is not null then
      -- A later Redbark correction updates bank fields while preserving user edits.
      update public.wealth_transactions
        set transaction_date = date_value, description = description_value,
            merchant_name = merchant_value, amount = amount_value,
            direction = direction_value, account_source = account_value,
            raw_row_json = item->'raw'
        where id = existing_id
          and (transaction_date, description, merchant_name, amount, direction, account_source, raw_row_json)
              is distinct from (date_value, description_value, merchant_value, amount_value, direction_value, account_value, item->'raw');
      if found then updated := updated + 1; else skipped := skipped + 1; end if;
      continue;
    end if;

    -- An exact Frollo match keeps the existing, possibly reviewed record.
    if exists (
      select 1 from public.wealth_transactions t
      where t.user_id = p_owner and t.dedupe_key like 'frollo:%'
        and t.transaction_date = date_value and t.amount = amount_value
        and t.direction = direction_value
        and regexp_replace(lower(t.description), '[^a-z0-9]+', '', 'g') =
            regexp_replace(lower(description_value), '[^a-z0-9]+', '', 'g')
    ) then
      skipped := skipped + 1;
      continue;
    end if;

    select * into merchant_map from public.wealth_merchant_maps
      where user_id = p_owner
        and position(lower(match_text) in lower(description_value || ' ' || merchant_value)) > 0
      order by length(match_text) desc limit 1;
    budget_value := coalesce(merchant_map.budget_category,
      case when direction_value = 'credit' then 'income' else 'lifestyle' end);
    category_value := coalesce(merchant_map.category_name,
      nullif(item->>'category_name', ''), 'Uncategorised');
    type_value := coalesce(merchant_map.transaction_type,
      case when item->>'transaction_class' = 'transfer' then 'transfer'
           when direction_value = 'credit' then 'income' else 'expense' end);
    class_value := coalesce(merchant_map.expense_class,
      case when type_value = 'transfer' then 'non_expense' else 'discretionary' end);
    merchant_value := coalesce(nullif(merchant_map.merchant_name, ''), merchant_value);

    insert into public.wealth_transactions (
      user_id, dedupe_key, transaction_date, description, merchant_name,
      amount, direction, account_source, budget_category, category_name,
      subcategory, transaction_type, expense_class, is_excluded,
      review_status, source_sheet, raw_row_json
    ) values (
      p_owner, transaction_key, date_value, description_value, merchant_value,
      amount_value, direction_value, account_value, budget_value, category_value,
      coalesce(merchant_map.subcategory, ''), type_value, class_value,
      type_value = 'transfer',
      case when type_value = 'transfer' then 'excluded' else 'pending' end,
      'Redbark webhook', item->'raw'
    );
    inserted := inserted + 1;
  end loop;

  update public.wealth_redbark_deliveries set
    received_count = jsonb_array_length(p_rows), inserted_count = inserted,
    updated_count = updated, skipped_count = skipped
    where delivery_id = p_delivery_id;
  return jsonb_build_object('already_processed', false,
    'received', jsonb_array_length(p_rows), 'inserted', inserted,
    'updated', updated, 'skipped', skipped);
end;
$$;

revoke all on function public.ingest_redbark_transactions(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_redbark_transactions(uuid, uuid, jsonb) to service_role;
