# Supabase Recovery and Verification v1

Generated: 2026-07-17T10:11:21.214Z
Duration: 9322ms

## Overall: MANUAL ACTION REQUIRED

## Summary

| Check | Status |
|-------|--------|
| Migration | PASS |
| Local CRUD | NOT TESTABLE |
| Production CRUD | FAIL |
| RLS | NOT TESTABLE |

## Root Causes

- Connection failed: TypeError: fetch failed

## Manual Steps Required


## Detailed Checks

- **Environment URL format**: PASS — host=qjzuledpatlbjsymqtbb.supabase.co
- **Service role key format**: PASS — format=sb_secret
- **Connection**: FAIL — TypeError: fetch failed
- **Schema**: NOT TESTABLE (Connection failed)
- **Local CRUD**: NOT TESTABLE (Connection failed)
- **Production Supabase connection**: FAIL — status=200 connected=undefined
- **Migration file 001_initial_p0.sql**: PASS — present in repo
- **Migration file 002_admin_dashboard.sql**: PASS — present in repo
- **Migration file 003_scheduler.sql**: PASS — present in repo
- **Migration file 004_security_rate_limits.sql**: PASS — present in repo
- **Migration file 005_team_profiles.sql**: PASS — present in repo
- **Migration file 006_team_profile_season_metadata.sql**: PASS — present in repo
- **Migration file 007_historical_match_backfill.sql**: PASS — present in repo
- **Migration file 008_recommendation_learning.sql**: PASS — present in repo
- **Migration file 009_schema_recovery_verify.sql**: PASS — present in repo