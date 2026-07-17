-- 009: Idempotent schema recovery / verification
-- Safe to re-run. Does not drop data or columns.
-- Rollback: no automatic rollback; new tables can be dropped manually if applied by mistake on wrong project.

begin;

-- ---------------------------------------------------------------------------
-- Admin dashboard (002) — recreate if missing
-- ---------------------------------------------------------------------------
create table if not exists public.admin_daily_summaries (
  summary_date date primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_daily_summaries_updated_at
  on public.admin_daily_summaries (updated_at desc);

create table if not exists public.admin_system_snapshots (
  snapshot_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_error_logs (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  message text not null,
  context jsonb,
  created_at timestamptz not null default now()
);

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

create index if not exists idx_admin_error_logs_created_at_desc
  on public.admin_error_logs (created_at desc);

create index if not exists idx_admin_error_logs_category
  on public.admin_error_logs (category);

-- ---------------------------------------------------------------------------
-- Scheduler (003) — recreate if missing
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Security rate limits (004)
-- ---------------------------------------------------------------------------
create table if not exists public.security_rate_limit_buckets (
  bucket_key text primary key,
  request_count integer not null default 0,
  window_started_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_security_rate_limit_buckets_updated_at
  on public.security_rate_limit_buckets (updated_at desc);

-- ---------------------------------------------------------------------------
-- RLS — enable on all service-role-only tables (no anon policies)
-- ---------------------------------------------------------------------------
alter table if exists public.admin_daily_summaries enable row level security;
alter table if exists public.admin_system_snapshots enable row level security;
alter table if exists public.admin_error_logs enable row level security;
alter table if exists public.execution_logs enable row level security;
alter table if exists public.scheduler_state enable row level security;
alter table if exists public.security_rate_limit_buckets enable row level security;

commit;
