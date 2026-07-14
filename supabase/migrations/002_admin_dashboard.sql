-- V2.0: Admin Dashboard daily summaries, system snapshots, error logs

begin;

create table if not exists public.admin_daily_summaries (
  summary_date date primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.admin_daily_summaries is
  'Pre-aggregated daily dashboard metrics. Updated by admin cron.';

create index if not exists idx_admin_daily_summaries_updated_at
  on public.admin_daily_summaries (updated_at desc);

create table if not exists public.admin_system_snapshots (
  snapshot_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.admin_system_snapshots is
  'Latest system metrics (quota, cache, analysis counts). Key: latest';

create table if not exists public.admin_error_logs (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  message text not null,
  context jsonb,
  created_at timestamptz not null default now(),
  constraint admin_error_logs_category_check
    check (category in (
      'api',
      'google',
      'parser',
      'provider',
      'cache',
      'validation'
    ))
);

create index if not exists idx_admin_error_logs_created_at_desc
  on public.admin_error_logs (created_at desc);

create index if not exists idx_admin_error_logs_category
  on public.admin_error_logs (category);

alter table public.admin_daily_summaries enable row level security;
alter table public.admin_system_snapshots enable row level security;
alter table public.admin_error_logs enable row level security;

commit;
