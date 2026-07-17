-- =============================================================================
-- Production Init Cleanup (one-time, run manually in Supabase SQL Editor)
-- =============================================================================
--
-- Purpose:
--   Clear test/operational data before go-live while preserving schema.
--
-- Preserved (NOT truncated):
--   - All tables, indexes, constraints, RLS, triggers
--   - supabase_migrations.* (migration history)
--   - auth.* / storage.* schemas
--   - public.feature_provider_cache
--   - public.security_rate_limit_buckets
--   - public.admin_daily_summaries
--   - public.admin_system_snapshots
--   - public.admin_error_logs
--   - Golden dataset (repo files under data/golden/, not a DB table)
--   - Users / admin configuration
--
-- Tables targeted (truncated only if they exist):
--   - match_records
--   - beta_recommendations
--   - beta_rolling_reports
--   - validation_entries
--   - validation_reports
--   - execution_logs
--   - scheduler_state
--
-- FK note:
--   beta_recommendations.match_record_id -> match_records.id (ON DELETE RESTRICT)
--   All listed tables are truncated together with CASCADE in one statement.
--
-- DO NOT run in application code. Review before executing on Production.
-- =============================================================================

begin;

do $$
declare
  target_tables text[] := array[
    'match_records',
    'beta_recommendations',
    'beta_rolling_reports',
    'validation_entries',
    'validation_reports',
    'execution_logs',
    'scheduler_state'
  ];
  tbl text;
  exists_flag boolean;
  row_count bigint;
  existing_tables text[] := array[]::text[];
  missing_tables text[] := array[]::text[];
  deleted_counts jsonb := '{}'::jsonb;
  truncate_sql text;
begin
  raise notice '=== Production Init Cleanup: pre-truncate row counts ===';

  foreach tbl in array target_tables loop
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = tbl
        and table_type = 'BASE TABLE'
    )
    into exists_flag;

    if exists_flag then
      existing_tables := array_append(existing_tables, tbl);

      execute format('select count(*)::bigint from public.%I', tbl)
      into row_count;

      deleted_counts := deleted_counts || jsonb_build_object(tbl, row_count);
      raise notice 'FOUND  public.% : % rows', tbl, row_count;
    else
      missing_tables := array_append(missing_tables, tbl);
      raise notice 'SKIP   public.% : table does not exist', tbl;
    end if;
  end loop;

  if coalesce(array_length(existing_tables, 1), 0) = 0 then
    raise notice '=== No target tables exist. Nothing to truncate. ===';
  else
    truncate_sql := format(
      'truncate table %s restart identity cascade',
      (
        select string_agg(format('public.%I', table_name), ', ' order by table_name)
        from unnest(existing_tables) as table_name
      )
    );

    raise notice '=== Executing: % ===', truncate_sql;
    execute truncate_sql;
    raise notice '=== Truncate completed successfully ===';
  end if;

  raise notice '=== Production Init Cleanup: summary ===';
  raise notice 'Tables truncated: %', existing_tables;
  raise notice 'Tables skipped (missing): %', missing_tables;
  raise notice 'Rows removed per table: %', deleted_counts::text;
end $$;

-- Post-check: verify remaining row counts (0 for truncated tables).
do $$
declare
  target_tables text[] := array[
    'match_records',
    'beta_recommendations',
    'beta_rolling_reports',
    'validation_entries',
    'validation_reports',
    'execution_logs',
    'scheduler_state'
  ];
  tbl text;
  exists_flag boolean;
  row_count bigint;
begin
  raise notice '=== Production Init Cleanup: post-truncate verification ===';

  foreach tbl in array target_tables loop
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = tbl
        and table_type = 'BASE TABLE'
    )
    into exists_flag;

    if exists_flag then
      execute format('select count(*)::bigint from public.%I', tbl)
      into row_count;

      if row_count = 0 then
        raise notice 'OK     public.% : 0 rows remaining', tbl;
      else
        raise exception 'VERIFY FAILED: public.% still has % rows', tbl, row_count;
      end if;
    else
      raise notice 'SKIP   public.% : table does not exist', tbl;
    end if;
  end loop;

  raise notice '=== Verification passed ===';
end $$;

commit;
