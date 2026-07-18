-- Weight Optimizer Phase 0: versioned runtime weight config storage (no production apply yet).

begin;

create table if not exists public.weight_config_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null,
  status text not null,
  provider_weights jsonb not null,
  market_blend_weight numeric(10, 6) not null,
  source_report_snapshot jsonb not null default '{}'::jsonb,
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  archived_at timestamptz,
  constraint weight_config_versions_status_check
    check (status in ('draft', 'active', 'archived')),
  constraint weight_config_versions_version_unique
    unique (version),
  constraint weight_config_versions_market_blend_weight_check
    check (market_blend_weight >= 0 and market_blend_weight <= 1)
);

create unique index if not exists uq_weight_config_versions_one_active
  on public.weight_config_versions (status)
  where status = 'active';

create index if not exists idx_weight_config_versions_status_created_at
  on public.weight_config_versions (status, created_at desc);

create index if not exists idx_weight_config_versions_version_desc
  on public.weight_config_versions (version desc);

comment on table public.weight_config_versions is
  'Versioned provider / market blend weights for Weight Optimizer. Phase 0: storage only; production still uses code constants until Phase 1.';

comment on column public.weight_config_versions.provider_weights is
  'Record<FeatureProviderKey, number> JSON; weights must sum to 1.';

comment on column public.weight_config_versions.market_blend_weight is
  'Market Engine blend ratio (0–1); maps to MARKET_ENGINE_INITIAL_WEIGHT when activated in Phase 2.';

comment on column public.weight_config_versions.source_report_snapshot is
  'WeightOptimizerReport or related snapshot JSON at draft creation time.';

alter table public.weight_config_versions enable row level security;

commit;
