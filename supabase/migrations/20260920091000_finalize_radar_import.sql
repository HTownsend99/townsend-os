-- Confirm the one-time production import completed, then remove its temporary helper objects.
do $verification$
declare
  radar_count integer;
begin
  select count(*) into radar_count
  from public.tasks
  where external_id like 'RAD-%';

  if radar_count > 0 and radar_count <> 82 then
    raise exception 'Incomplete Radar import: expected 82 tasks, found %', radar_count;
  end if;
end;
$verification$;

drop function if exists public.import_radar_tasks();
drop table if exists public.data_imports;
