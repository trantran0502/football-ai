# Full Production Health Check Report v1

Generated: 2026-07-17T06:47:50.857Z
Duration: 25159ms
Git Commit: 10eb5316bcde0a5d5a530546d2c8b550d8158d75

## Overall Status

**PARTIAL PASS**

- Critical Issues: 0
- High Issues: 0
- Medium Issues: 0
- Low Issues: 6

## Service Summary

| Service | Status |
|---------|--------|
| Supabase | PASS |
| API-Football | NOT CONFIGURED |
| Gemini | NOT CONFIGURED |
| Scheduler | NOT CONFIGURED |
| Pipeline | PASS |
| Production | PASS |

## Supabase Recovery (v1)

| Check | Status |
|-------|--------|
| Supabase (health-check) | PASS |
| Migration | PASS |
| Local CRUD | PASS |
| Production CRUD | NOT TESTABLE |
| RLS | PASS |

**Root cause (resolved):** Schema probe used `select('id')` on all tables; `scheduler_state`, `admin_*`, and `security_rate_limit_buckets` use non-`id` primary keys, causing false FAIL. See `SUPABASE_HEALTH_REPORT.md` and `npm run health:supabase`.

**Production CRUD:** `ADMIN_API_KEY` missing from `.env.local`. After setting matching key locally + Vercel Production, deploy latest and run `npm run health:supabase:production`. See `PRODUCTION_SUPABASE_VERIFICATION.md`.

## Environment Variables

| Variable | Required | Present | Client Safe | Server Only | Format |
|----------|----------|---------|-------------|-------------|--------|
| SUPABASE_URL | yes | yes | no | yes | ok |
| SUPABASE_SERVICE_ROLE_KEY | yes | yes | no | yes | ok |
| NEXT_PUBLIC_SUPABASE_URL | no | no | yes | no | - |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | no | no | yes | no | - |
| API_FOOTBALL_KEY | yes | no | no | yes | - |
| GOOGLE_GEMINI_API_KEY | no | no | no | yes | - |
| ADMIN_API_KEY | yes | no | no | yes | - |
| CRON_SECRET | yes | no | no | yes | - |
| FOOTBALL_DATA_MODE | no | no | no | yes | - |
| SCHEDULER_ENABLED | no | no | no | yes | - |
| NEXT_PUBLIC_BETA_RECOMMENDATION_MODE | no | no | yes | no | - |
| BETA_RECOMMENDATION_MODE | no | no | no | yes | - |
| RATE_LIMIT_ADAPTER | no | no | no | yes | - |
| GOOGLE_GEMINI_MODEL | no | no | no | yes | - |
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

- **API_FOOTBALL_KEY**: NOT CONFIGURED (Required variable missing locally)
- **ADMIN_API_KEY**: NOT CONFIGURED (Required variable missing locally)
- **CRON_SECRET**: NOT CONFIGURED (Required variable missing locally)

### Security

- **Service role not in NEXT_PUBLIC**: PASS
- **Admin API key configured**: NOT CONFIGURED
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

- **insert match_records**: PASS — id=2f12fff4-f35c-4c54-a6d7-9154b94fea82
- **select match_records**: PASS — league=HEALTH_CHECK
- **update match_records**: PASS — HEALTH_CHECK_UPDATED
- **delete match_records**: PASS — test row removed

### API-Football

- **API key configured**: NOT CONFIGURED

### Gemini

- **API key configured**: NOT CONFIGURED

### Database Quality

- **Active match_records reachable**: PASS — count=102
- **Stale pending fixtures sample**: PASS — sample=0

### Deployment

- **Homepage**: PASS — status=200 latencyMs=914 url=https://football-ai-ten.vercel.app/
- **Admin dashboard**: PASS — status=200 latencyMs=1052 url=https://football-ai-ten.vercel.app/admin
- **Health API (public)**: PASS — status=200 latencyMs=659 url=https://football-ai-ten.vercel.app/api/data/health

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