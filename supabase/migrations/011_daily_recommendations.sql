-- daily_recommendations: AI daily picks generated after Daily Scheduler runs

begin;

create table if not exists public.daily_recommendations (
  id uuid primary key,
  scheduler_run uuid not null,
  fixture_id bigint,
  match_date date not null,
  kickoff_time timestamptz,
  league_id integer,
  league_name text not null default '',
  country text not null default '',
  home_team text not null,
  away_team text not null,
  market text not null,
  recommendation text not null,
  odds numeric(10, 4) not null,
  confidence integer not null,
  score integer not null,
  rank integer not null,
  grade text not null,
  reasoning jsonb not null default '[]'::jsonb,
  analysis_snapshot jsonb,
  created_at timestamptz not null default now(),
  constraint daily_recommendations_score_check
    check (score >= 0 and score <= 100),
  constraint daily_recommendations_confidence_check
    check (confidence >= 0 and confidence <= 100),
  constraint daily_recommendations_rank_check
    check (rank >= 1 and rank <= 3)
);

comment on table public.daily_recommendations is
  'Daily AI recommendation leaderboard. Regenerated on each Daily Scheduler run.';

create index if not exists idx_daily_recommendations_match_date_rank
  on public.daily_recommendations (match_date, rank);

create index if not exists idx_daily_recommendations_scheduler_run
  on public.daily_recommendations (scheduler_run);

alter table public.daily_recommendations enable row level security;
alter table public.daily_recommendations force row level security;

commit;
