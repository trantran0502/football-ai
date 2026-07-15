-- V2.1.1: Distinguish requested fixture season from historical data season

begin;

alter table public.team_profiles
  add column if not exists requested_season integer,
  add column if not exists is_historical_baseline boolean not null default false,
  add column if not exists staleness_years integer;

create unique index if not exists idx_team_profiles_team_league_requested_season
  on public.team_profiles (team_id, league_id, requested_season)
  where requested_season is not null;

comment on column public.team_profiles.season is
  'Actual data season used for API baseline (dataSeason).';
comment on column public.team_profiles.requested_season is
  'Fixture context season requested by scheduler (requestedSeason).';

commit;
