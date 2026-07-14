-- RC2: Security rate limit buckets (Supabase-backed)

begin;

create table if not exists public.security_rate_limit_buckets (
  bucket_key text primary key,
  request_count integer not null default 0,
  window_started_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_security_rate_limit_buckets_updated_at
  on public.security_rate_limit_buckets (updated_at desc);

comment on table public.security_rate_limit_buckets is
  'Rate limit counters keyed by route and client identity hash.';

alter table public.security_rate_limit_buckets enable row level security;

commit;
