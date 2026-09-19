-- Replace overlapping task labels with a small, durable subject taxonomy.
-- Timing remains in due; workflow remains in workflow_status.

create or replace function public.canonical_task_category(input_category text, task_name text default '')
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when lower(trim(coalesce(input_category, ''))) in ('admin', 'email admin', 'errand', 'licence', 'security') then 'Admin'
    when lower(trim(coalesce(input_category, ''))) in ('career', 'education', 'job / career', 'work') then 'Career & Education'
    when lower(trim(coalesce(input_category, ''))) in ('bills', 'finance', 'finance admin', 'financial', 'health insurance', 'insurance', 'membership', 'payments', 'subscription', 'wealth') then 'Finance'
    when lower(trim(coalesce(input_category, ''))) in ('appointment', 'health') then 'Health'
    when lower(trim(coalesce(input_category, ''))) in ('home & pets', 'household', 'pet admin', 'pet health', 'pet insurance', 'property') then 'Home & Pets'
    when lower(trim(coalesce(input_category, ''))) in ('personal', 'future buys', 'messages', 'shopping', 'socialising') then 'Personal'
    when lower(trim(coalesce(input_category, ''))) in ('projects', 'automation', 'concepts', 'data', 'long term', 'planning', 'project', 'townsend os') then 'Projects'
    when lower(trim(coalesce(input_category, ''))) in ('legal', 'legal decision') then 'Legal'
    when lower(trim(coalesce(input_category, ''))) in ('today', 'upcoming') then
      case
        when lower(coalesce(task_name, '')) ~ '\m(legal|class action|settlement|court|solicitor|barrister)\M' then 'Legal'
        when lower(coalesce(task_name, '')) ~ '\m(job|career|cv|resume|application|apply|gamsat|shift|work|onboarding)\M' then 'Career & Education'
        when lower(coalesce(task_name, '')) ~ '\m(pet|charles|property|rent|home|household|strata)\M|body.?corporate' then 'Home & Pets'
        when lower(coalesce(task_name, '')) ~ '\m(health|doctor|medical|appointment|vaccination|gym|fitness|vyvanse)\M' then 'Health'
        when lower(coalesce(task_name, '')) ~ '\m(bill|budget|expense|payment|pay|balance|bank|card|insurance|membership|subscription|tax)\M|renewal funds' then 'Finance'
        when lower(coalesce(task_name, '')) ~ '\m(project|plan|website|dashboard|automation|app|research|brainstorm|goal)\M' then 'Projects'
        when lower(coalesce(task_name, '')) ~ '\m(admin|email|document|photo|licence|license|account|security|export)\M' then 'Admin'
        else 'Personal'
      end
    else 'Personal'
  end
$$;

update public.tasks
set cat = public.canonical_task_category(cat, name)
where cat is distinct from public.canonical_task_category(cat, name);

alter table public.tasks drop constraint if exists tasks_cat_check;
alter table public.tasks add constraint tasks_cat_check
  check (cat in ('Admin', 'Career & Education', 'Finance', 'Health', 'Home & Pets', 'Personal', 'Projects', 'Legal'));

create or replace function public.normalize_task_category()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.cat = public.canonical_task_category(new.cat, new.name);
  return new;
end;
$$;

drop trigger if exists normalize_task_category on public.tasks;
create trigger normalize_task_category
before insert or update of cat, name on public.tasks
for each row execute function public.normalize_task_category();
