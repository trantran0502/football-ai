-- V2.1: Persistent team profiles for feature / recommendation / replay / learning

begin;

create table if not exists public.team_profiles (
  id uuid primary key default gen_random_uuid(),
  team_id bigint not null,
  team_name text not null,
  league_id bigint not null,
  league_name text,
  season integer not null,

  sample_size integer not null default 0,

  recent10_wins integer,
  recent10_draws integer,
  recent10_losses integer,
  recent10_points_per_game numeric,

  recent10_avg_goals numeric,
  recent10_avg_conceded numeric,

  home5_matches integer,
  home5_win_rate numeric,
  home5_avg_goals numeric,
  home5_avg_conceded numeric,

  away5_matches integer,
  away5_win_rate numeric,
  away5_avg_goals numeric,
  away5_avg_conceded numeric,

  btts_rate numeric,
  over25_rate numeric,
  over35_rate numeric,
  under25_rate numeric,
  clean_sheet_rate numeric,
  failed_to_score_rate numeric,

  avg_shots numeric,
  avg_shots_on_target numeric,
  avg_possession numeric,
  avg_xg numeric,
  avg_xga numeric,

  form_score numeric,
  momentum_score numeric,

  source text not null,
  data_completeness numeric not null default 0,
  calculated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_team_profiles_team_league_season
  on public.team_profiles (team_id, league_id, season);

create index if not exists idx_team_profiles_calculated_at
  on public.team_profiles (calculated_at desc);

create index if not exists idx_team_profiles_league_season
  on public.team_profiles (league_id, season);

comment on table public.team_profiles is
  'Persistent team statistical profiles keyed by team, league, and season.';

alter table public.team_profiles enable row level security;

commit;
