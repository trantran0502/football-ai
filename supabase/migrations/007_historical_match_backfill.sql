-- Historical match backfill metadata for match_records

begin;

alter table public.match_records
  add column if not exists fixture_id integer,
  add column if not exists league_id integer,
  add column if not exists season integer,
  add column if not exists home_team_id integer,
  add column if not exists away_team_id integer;

create unique index if not exists uq_match_records_fixture_id
  on public.match_records (fixture_id)
  where fixture_id is not null;

create index if not exists idx_match_records_fixture_id
  on public.match_records (fixture_id)
  where fixture_id is not null;

comment on column public.match_records.fixture_id is
  'API-Football fixture id for deduplication and backfill tracking.';

commit;
