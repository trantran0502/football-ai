-- Recommendation learning: accumulate provider performance after each VERIFIED match.

begin;

create table if not exists public.recommendation_learning (
  id uuid primary key default gen_random_uuid(),
  match_record_id uuid not null,
  fixture_id integer,
  recommendation jsonb,
  actual_result jsonb not null,
  hit boolean not null,
  provider_diagnostics jsonb not null default '[]'::jsonb,
  provider_overall_confidence numeric(10, 6),
  market_outcomes jsonb not null default '[]'::jsonb,
  total_profit numeric(10, 4) not null default 0,
  total_stake numeric(10, 4) not null default 0,
  verified_at timestamptz not null,
  match_date date not null,
  league text not null default '',
  home_team text not null,
  away_team text not null,
  source text not null default 'app',
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recommendation_learning_match_record_id_fkey
    foreign key (match_record_id)
    references public.match_records (id)
    on delete restrict
);

create unique index if not exists uq_recommendation_learning_match_record_id
  on public.recommendation_learning (match_record_id);

create index if not exists idx_recommendation_learning_verified_at_desc
  on public.recommendation_learning (verified_at desc);

create index if not exists idx_recommendation_learning_fixture_id
  on public.recommendation_learning (fixture_id)
  where fixture_id is not null;

comment on table public.recommendation_learning is
  'Per-match recommendation learning records after VERIFIED. TypeScript: RecommendationLearningRecord';

comment on column public.recommendation_learning.recommendation is
  'RecommendationEngineResult snapshot at verification time.';

comment on column public.recommendation_learning.provider_diagnostics is
  'ReplayProviderRecommendationDiagnostic[]; same mapping as Replay and Validation Dashboard.';

comment on column public.recommendation_learning.market_outcomes is
  'Per-market validation outcomes for 1X2, AH, O/U, BTTS.';

alter table public.recommendation_learning enable row level security;

commit;
