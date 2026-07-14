-- M0: Phase 1 P0 storage migration
-- Tables: match_records, beta_recommendations, beta_rolling_reports
-- Security: RLS enabled; no anon/authenticated policies (service_role only)
-- Do not run against production until reviewed.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- match_records
-- Maps to LocalStorage key: football-ai-match-records
-- TypeScript: HistoricalMatchRecord
-- ---------------------------------------------------------------------------
create table if not exists public.match_records (
  id uuid primary key,
  match_date date not null,
  league text not null default '',
  home_team text not null,
  away_team text not null,
  status text not null,
  raw_odds text not null,
  market_selections jsonb not null,
  candidates jsonb not null default '[]'::jsonb,
  analysis_snapshot jsonb,
  result jsonb,
  verification_result jsonb,
  legacy_date text,
  source text not null default 'app',
  schema_version integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint match_records_status_check
    check (status in ('PENDING', 'VERIFIED', 'FAILED', 'CANCELLED'))
);

comment on table public.match_records is
  'Historical match records (P0). Mirrors HistoricalMatchRecord from lib/database/matchSchema.ts';

-- Prevent duplicate active matches for the same date + teams (HistoryRepository.findByMatchKey)
create unique index if not exists uq_match_records_active_key
  on public.match_records (match_date, home_team, away_team)
  where status <> 'CANCELLED';

create index if not exists idx_match_records_status
  on public.match_records (status);

create index if not exists idx_match_records_created_at_desc
  on public.match_records (created_at desc);

create index if not exists idx_match_records_match_date
  on public.match_records (match_date);

-- ---------------------------------------------------------------------------
-- beta_recommendations
-- Maps to LocalStorage key: football-ai-beta-recommendations
-- TypeScript: BetaRecommendationRecord
-- ---------------------------------------------------------------------------
create table if not exists public.beta_recommendations (
  id uuid primary key,
  match_record_id uuid not null,
  model_version text not null,
  recommended_at timestamptz not null,
  home_team text not null,
  away_team text not null,
  match_date date not null,
  status text not null,
  settlement text,
  profit numeric(10, 4),
  hit boolean,
  verified_at timestamptz,
  candidate jsonb not null,
  raw_odds text not null,
  market_selections jsonb not null,
  team_data jsonb,
  rules_used jsonb not null default '[]'::jsonb,
  final_score jsonb,
  source text not null default 'app',
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beta_recommendations_match_record_id_fkey
    foreign key (match_record_id)
    references public.match_records (id)
    on delete restrict,
  constraint beta_recommendations_status_check
    check (status in ('PENDING', 'VERIFIED')),
  constraint beta_recommendations_settlement_check
    check (
      settlement is null
      or settlement in ('WIN', 'LOSE', 'PUSH', 'HALF_WIN', 'HALF_LOSE')
    )
);

comment on table public.beta_recommendations is
  'Beta recommendation records (P0). Mirrors BetaRecommendationRecord from lib/beta/types.ts';

create index if not exists idx_beta_recommendations_match_record_id
  on public.beta_recommendations (match_record_id);

create index if not exists idx_beta_recommendations_status
  on public.beta_recommendations (status);

create index if not exists idx_beta_recommendations_model_version
  on public.beta_recommendations (model_version);

create index if not exists idx_beta_recommendations_recommended_at_desc
  on public.beta_recommendations (recommended_at desc);

-- ---------------------------------------------------------------------------
-- beta_rolling_reports
-- Maps to LocalStorage key: football-ai-beta-rolling-reports
-- TypeScript: RollingEvaluationReport (stored in report jsonb)
-- ---------------------------------------------------------------------------
create table if not exists public.beta_rolling_reports (
  id uuid primary key default gen_random_uuid(),
  model_version text not null,
  evaluated_at timestamptz not null,
  window_size integer not null,
  report jsonb not null,
  source text not null default 'app',
  schema_version integer not null default 1,
  created_at timestamptz not null default now()
);

comment on table public.beta_rolling_reports is
  'Rolling evaluation reports (P0). Mirrors RollingEvaluationReport from lib/beta/types.ts';

create unique index if not exists uq_beta_rolling_reports_version_time
  on public.beta_rolling_reports (model_version, evaluated_at);

create index if not exists idx_beta_rolling_reports_model_version_evaluated_at_desc
  on public.beta_rolling_reports (model_version, evaluated_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Enable RLS with no anon/authenticated policies => default deny for clients.
-- service_role (server-only) bypasses RLS.
-- ---------------------------------------------------------------------------
alter table public.match_records enable row level security;
alter table public.beta_recommendations enable row level security;
alter table public.beta_rolling_reports enable row level security;

-- Force RLS even for table owner (defense in depth; service_role still bypasses)
alter table public.match_records force row level security;
alter table public.beta_recommendations force row level security;
alter table public.beta_rolling_reports force row level security;

commit;
