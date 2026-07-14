-- V5: Scheduler execution logs and state

begin;

create table if not exists public.execution_logs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  run_date date,
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_ms integer,
  success boolean not null default false,
  error_message text,
  context jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_execution_logs_job_started
  on public.execution_logs (job_name, started_at desc);

create index if not exists idx_execution_logs_run_date
  on public.execution_logs (run_date desc);

create table if not exists public.scheduler_state (
  state_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.execution_logs is
  'Scheduler job execution history with timing and outcome.';

comment on table public.scheduler_state is
  'Scheduler runtime state: locks, lastRun, nextRun.';

alter table public.execution_logs enable row level security;
alter table public.scheduler_state enable row level security;

alter table public.admin_error_logs
  drop constraint if exists admin_error_logs_category_check;

alter table public.admin_error_logs
  add constraint admin_error_logs_category_check
  check (category in (
    'api',
    'google',
    'parser',
    'provider',
    'cache',
    'validation',
    'scheduler'
  ));

commit;
