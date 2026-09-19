create table if not exists public.job_applications (
  id bigint generated always as identity primary key,
  role text not null,
  employer text,
  location text,
  sector text,
  status text not null default 'Drafting',
  date_applied date,
  closing_date date,
  next_action text,
  next_action_date date,
  key_requirements text,
  salary text,
  link text,
  resume_version text,
  cover_letter_version text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_job_applications_updated_at on public.job_applications;
create trigger trg_job_applications_updated_at
before update on public.job_applications
for each row execute function public.set_updated_at();

insert into public.job_applications
  (role, employer, location, sector, status, date_applied, closing_date, next_action, next_action_date, key_requirements, salary, link, resume_version, cover_letter_version, notes)
values
  ('EXAMPLE — Senior Property Solicitor', 'Sample Firm (delete me)', 'Sydney', 'Property', 'Applied', '2026-06-18', '2026-06-30', 'Follow up if no response', '2026-06-25', '5+ yrs PAE commercial property; leasing; strata; client-facing. EMPHASISED: development / off-the-plan experience.', '$140k–160k + super', 'https://example.com/job', 'Resume - HT - Sample Firm.docx', 'Cover Letter - HT - Sample Firm.docx', 'Sample row showing the tracker working. Delete once you log a real application.'),
  ('EXAMPLE — Planning & Environment Lawyer', 'NSW Government (delete me)', 'Sydney', 'Government', 'Interview', '2026-06-10', '2026-06-15', 'Prepare for first-round interview', '2026-06-24', 'LEC Class 1–4 experience; planning law; public sector. EMPHASISED: government/regulatory exposure.', '$130k + super', 'https://example.com/gov-job', 'Resume - HT - NSW Gov.docx', 'Cover Letter - HT - NSW Gov.docx', 'Second sample row in a different status so you can see the pipeline.');;
