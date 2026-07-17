# Supabase Recovery and Verification v1

Generated: 2026-07-17T06:46:59.751Z
Duration: 9488ms

## Overall: PARTIAL PASS

## Summary

| Check | Status |
|-------|--------|
| Migration | PASS |
| Local CRUD | PASS |
| Production CRUD | NOT TESTABLE |
| RLS | PASS |

## Root Causes

- None identified.

## Detailed Checks

- **Environment URL format**: PASS — host=qjzuledpatlbjsymqtbb.supabase.co
- **Service role key format**: PASS — format=sb_secret
- **Connection**: PASS — match_records reachable
- **Schema table match_records**: PASS — 001_initial_p0.sql
- **Schema table beta_recommendations**: PASS — 001_initial_p0.sql
- **Schema table beta_rolling_reports**: PASS — 001_initial_p0.sql
- **Schema table recommendation_learning**: PASS — 008_recommendation_learning.sql
- **Schema table team_profiles**: PASS — 005_team_profiles.sql
- **Schema table execution_logs**: PASS — 003_scheduler.sql
- **Schema table scheduler_state**: PASS — 003_scheduler.sql
- **Schema table admin_daily_summaries**: PASS — 002_admin_dashboard.sql
- **Schema table admin_system_snapshots**: PASS — 002_admin_dashboard.sql
- **Schema table admin_error_logs**: PASS — 002_admin_dashboard.sql
- **Schema table security_rate_limit_buckets**: PASS — 004_security_rate_limits.sql
- **Logical entity fixture**: PASS — match_records.fixture_id + analysis_snapshot (fixture_id column; full fixture context in analysis_snapshot JSON)
- **Logical entity market_snapshot**: PASS — match_records.market_selections + analysis_snapshot.marketAnalysis (Raw odds text + normalized markets in JSON)
- **Logical entity recommendation**: PASS — beta_recommendations.candidate + match_record_id FK (Also mirrored in match_records.candidates / analysis_snapshot)
- **Logical entity validation_result**: PASS — match_records.verification_result (Post-match validation JSON on match_records)
- **Logical entity evidence_report**: PASS — match_records.analysis_snapshot / candidates evidence fields (Evidence engine output embedded in analysis snapshot)
- **Logical entity ai_learning_report**: PASS — recommendation_learning.provider_diagnostics + recommendation JSON (Analysis-only AI learning suggestions stay in-memory; verified learning persists here)
- **Logical entity historical_fundamentals**: PASS — match_records.analysis_snapshot (dataMode=historical_fundamentals) (Backtest snapshots only; excluded from market ROI learning)
- **Logical entity scheduler_runs**: PASS — execution_logs.job_name + started_at + context (Legacy spec name; code uses execution_logs)
- **RLS policy model**: PASS — All tables use RLS enabled with no anon/authenticated policies; service_role only
- **Browser client key usage**: PASS — No NEXT_PUBLIC Supabase keys; browser uses localStorage + admin API routes
- **CRUD fixture (match_records insert)**: PASS — id=50f5030b-ac20-4892-886f-f897196c7bdd fixtureId=999051220
- **CRUD market snapshot (raw_odds + market_selections)**: PASS — rawOdds length=49 markets=0
- **CRUD fixture (match_records select)**: PASS — fixture_id present
- **CRUD match_records update**: PASS — HEALTH_CHECK_UPDATED
- **CRUD validation (verification_result update)**: PASS — jsonb column writable
- **CRUD evidence (analysis_snapshot)**: PASS — Embedded JSON column available; null snapshot accepted for health-check row
- **CRUD fixture (match_records delete)**: PASS — removed
- **CRUD scheduler_runs (execution_logs insert)**: PASS — id=130cb68c-864d-450e-b4b3-a1b1aa4cc3c1
- **CRUD scheduler_state upsert**: PASS — health-check:d337454a-cf0b-428b-8d7e-042e4e964ba8
- **CRUD scheduler cleanup**: PASS — execution_logs + scheduler_state removed
- **CRUD admin_error_logs insert**: PASS — 2fe4cb64-117d-4fda-aa0e-be02636812d6
- **CRUD security_rate_limit_buckets upsert**: PASS — health-check:d337454a-cf0b-428b-8d7e-042e4e964ba8
- **CRUD ai_learning_report (recommendation_learning insert)**: PASS — c7899d3e-9d20-447d-8fa9-518e5ef50e36
- **CRUD historical_fundamentals (embedded snapshot)**: PASS — Stored as match_records.analysis_snapshot; no separate table by design
- **Relation FK match_records → recommendation_learning**: PASS — match_record_id=fc1d8a0b-125f-4526-acd8-34d40b56eccd
- **CRUD learning cleanup**: PASS — orphan check passed
- **Local CRUD summary**: PASS — healthCheckId=d337454a-cf0b-428b-8d7e-042e4e964ba8
- **Production Supabase (authenticated health)**: NOT TESTABLE (ADMIN_API_KEY not configured locally; public health only returns ok:true)
- **Production API route connectivity**: PASS — status=200 ok=true
- **Migration file 001_initial_p0.sql**: PASS — present in repo
- **Migration file 002_admin_dashboard.sql**: PASS — present in repo
- **Migration file 003_scheduler.sql**: PASS — present in repo
- **Migration file 004_security_rate_limits.sql**: PASS — present in repo
- **Migration file 005_team_profiles.sql**: PASS — present in repo
- **Migration file 006_team_profile_season_metadata.sql**: PASS — present in repo
- **Migration file 007_historical_match_backfill.sql**: PASS — present in repo
- **Migration file 008_recommendation_learning.sql**: PASS — present in repo
- **Migration file 009_schema_recovery_verify.sql**: PASS — present in repo