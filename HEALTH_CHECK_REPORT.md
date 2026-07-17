# Full Production Health Check Report v1

Generated: 2026-07-17T15:43:38.962Z
Duration: 25969ms
Git Commit: 0d375c9c02f1e8b0e173a72e886cf599ab3deaf3

## Overall Status

**PASS**

- Critical Issues: 0
- High Issues: 0
- Medium Issues: 0
- Low Issues: 6

## Service Summary

| Service | Status |
|---------|--------|
| Supabase | PASS |
| API-Football | PASS |
| Gemini | OPTIONAL (Unavailable) |
| Scheduler | NOT CONFIGURED |
| Pipeline | PASS |
| Production | PASS |

## Environment Variables

| Variable | Required | Present | Client Safe | Server Only | Format |
|----------|----------|---------|-------------|-------------|--------|
| SUPABASE_URL | yes | yes | no | yes | ok |
| SUPABASE_SERVICE_ROLE_KEY | yes | yes | no | yes | ok |
| NEXT_PUBLIC_SUPABASE_URL | no | no | yes | no | - |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | no | no | yes | no | - |
| API_FOOTBALL_KEY | yes | yes | no | yes | ok |
| GOOGLE_GEMINI_API_KEY | no | yes | no | yes | ok |
| ADMIN_API_KEY | yes | yes | no | yes | ok |
| CRON_SECRET | yes | no | no | yes | - |
| FOOTBALL_DATA_MODE | no | no | no | yes | - |
| SCHEDULER_ENABLED | no | no | no | yes | - |
| NEXT_PUBLIC_BETA_RECOMMENDATION_MODE | no | no | yes | no | - |
| BETA_RECOMMENDATION_MODE | no | no | no | yes | - |
| RATE_LIMIT_ADAPTER | no | no | no | yes | - |
| GOOGLE_GEMINI_MODEL | no | yes | no | yes | ok |
| API_FOOTBALL_BASE_URL | no | no | no | yes | - |

## Detailed Checks

### Code Health

- **npm test**: PASS — exit 0
- **npm run build**: PASS — exit 0
- **npm run lint**: WARNING — errors=3 warnings=71
- **npm run validate:system**: PASS — overall=PASS

### Pipeline

- **Verified pipeline**: PASS — checksPassed=146
- **Market engine integration**: PASS

### Learning

- **Fundamentals backtest isolation**: PASS — Unit tests enforce historical_fundamentals separation

### Data Leakage

- **Pre-match snapshot validator**: PASS — fundamentalsBacktest.test.ts covers leakage rules

### Environment

- **CRON_SECRET**: NOT CONFIGURED (Required variable missing locally)

### Security

- **Service role not in NEXT_PUBLIC**: PASS
- **Admin API key configured**: PASS
- **Cron secret configured**: NOT CONFIGURED
- **Supabase client uses server-only env**: PASS — Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (no browser anon client)

### LocalStorage

- **football-ai-match-records**: WARNING — Hybrid: Supabase primary when configured; localStorage fallback/cache
- **football-ai-beta-recommendations**: WARNING — Cache / legacy P0
- **football-ai-beta-rolling-reports**: WARNING — Cache / legacy P0
- **football-ai-free-data:***: PASS — Client cache only
- **football-ai-api-usage**: PASS — Client quota cache
- **football-ai-final-score:***: PASS — Client cache
- **Cross-device sync**: WARNING — Production should persist via Supabase APIs, not localStorage alone

### Scheduler

- **vercel.json cron definitions**: PASS — 4 cron routes configured UTC
- **Production cron execution**: NOT TESTABLE (Requires Vercel dashboard / live cron invocation with CRON_SECRET)
- **Secret verification (code)**: PASS — requireCronAuth uses timing-safe Bearer compare

### Supabase

- **Connection probe**: PASS — host=qjzuledpatlbjsymqtbb.supabase.co rows=1
- **Embedded models note**: WARNING — Fixture/Market/Evidence/Learning reports are JSON-embedded, not separate tables

### Supabase Schema

- **match_records**: PASS — SELECT probe succeeded
- **beta_recommendations**: PASS — SELECT probe succeeded
- **beta_rolling_reports**: PASS — SELECT probe succeeded
- **recommendation_learning**: PASS — SELECT probe succeeded
- **team_profiles**: PASS — SELECT probe succeeded
- **execution_logs**: PASS — SELECT probe succeeded
- **scheduler_state**: PASS — SELECT probe succeeded
- **admin_daily_summaries**: PASS — SELECT probe succeeded
- **admin_system_snapshots**: PASS — SELECT probe succeeded
- **admin_error_logs**: PASS — SELECT probe succeeded
- **security_rate_limit_buckets**: PASS — SELECT probe succeeded

### Supabase CRUD

- **insert match_records**: PASS — id=8762dedf-d8a9-4f4c-9787-18b385c0fd31
- **select match_records**: PASS — league=HEALTH_CHECK
- **update match_records**: PASS — HEALTH_CHECK_UPDATED
- **delete match_records**: PASS — test row removed

### API-Football

- **API key configured**: PASS — API_FOOTBALL_KEY present
- **Fixture fetch**: PASS — date=2026-07-16 count=114 latencyMs=989

### Gemini

- **Optional provider**: OPTIONAL — Unavailable latencyMs=914 (billing/quota/network or empty response)

### Database Quality

- **Active match_records reachable**: PASS — count=102
- **Stale pending fixtures sample**: PASS — sample=0

### Deployment

- **Homepage**: PASS — status=200 latencyMs=156 url=https://football-ai-ten.vercel.app/
- **Admin dashboard**: PASS — status=200 latencyMs=673 url=https://football-ai-ten.vercel.app/admin
- **Health API (public)**: PASS — status=200 latencyMs=693 url=https://football-ai-ten.vercel.app/api/data/health

### Dashboard

- **Browser UI verification**: NOT TESTABLE (Automated HTTP only in v1)

### Frontend

- **Interactive parser flow**: NOT TESTABLE (Requires manual/browser E2E)

### Observability

- **Structured logs in scheduler**: PASS — execution_logs + admin_error_logs tables

### Recovery

- **Provider failure fallbacks**: PASS — Unit tests + validate:system verified pipeline

### Performance

- **Homepage latency budget**: NOT TESTABLE (No automated Lighthouse run in v1)

## Required Fixes

- None blocking at this time.

## Deferred Improvements

- [Code Health] npm run lint
- [LocalStorage] football-ai-match-records
- [LocalStorage] football-ai-beta-recommendations
- [LocalStorage] football-ai-beta-rolling-reports
- [LocalStorage] Cross-device sync
- [Supabase] Embedded models note