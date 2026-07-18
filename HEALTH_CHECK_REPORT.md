# Full Production Health Check Report v1

Generated: 2026-07-18T13:45:08.726Z
Duration: 82745ms
Git Commit: 3b672c85f0d3d398344992ba6aa4650f1b75c10f

## Overall Status

**FAIL**

- Critical Issues: 0
- High Issues: 2
- Medium Issues: 1
- Low Issues: 6

## Service Summary

| Service | Status |
|---------|--------|
| Supabase | FAIL |
| API-Football | PASS |
| Gemini | OPTIONAL (Unavailable) |
| Scheduler | PASS |
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
| CRON_SECRET | yes | yes | no | yes | ok |
| FOOTBALL_DATA_MODE | no | no | no | yes | - |
| SCHEDULER_ENABLED | no | no | no | yes | - |
| NEXT_PUBLIC_BETA_RECOMMENDATION_MODE | no | no | yes | no | - |
| BETA_RECOMMENDATION_MODE | no | no | no | yes | - |
| RATE_LIMIT_ADAPTER | no | no | no | yes | - |
| GOOGLE_GEMINI_MODEL | no | yes | no | yes | ok |
| API_FOOTBALL_BASE_URL | no | no | no | yes | - |

## Detailed Checks

### Code Health

- **npm test**: FAIL — tConfigService.lifecycle.test.ts && tsx lib/healthCheck/supabaseHealthCheck.test.ts && tsx lib/supabase/services/weightConfigService.test.ts && tsx lib/admin/weightConfigAdminApi.test.ts && tsx lib/ad
- **npm run build**: PASS — exit 0
- **npm run lint**: WARNING — errors=4 warnings=75
- **npm run validate:system**: FAIL — overall=FAIL

### Pipeline

- **Verified pipeline**: PASS — checksPassed=146
- **Market engine integration**: PASS

### Learning

- **Fundamentals backtest isolation**: PASS — Unit tests enforce historical_fundamentals separation

### Data Leakage

- **Pre-match snapshot validator**: PASS — fundamentalsBacktest.test.ts covers leakage rules

### Security

- **Service role not in NEXT_PUBLIC**: PASS
- **Admin API key configured**: PASS
- **Cron secret configured**: PASS
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

- **Connection probe**: FAIL — TypeError: fetch failed (TypeError: fetch failed)
- **Schema tables**: NOT TESTABLE (Connection failed)
- **CRUD test**: NOT TESTABLE (Connection failed)

### API-Football

- **API key configured**: PASS — API_FOOTBALL_KEY present
- **Fixture fetch**: PASS — date=2026-07-17 count=264 latencyMs=1138

### Gemini

- **Optional provider**: OPTIONAL — Unavailable latencyMs=8755 (billing/quota/network or empty response)

### Database Quality

- **Active match_records reachable**: WARNING — count=unknown
- **Stale pending fixtures sample**: PASS — sample=0

### Deployment

- **Homepage**: PASS — status=200 latencyMs=240 url=https://football-ai-ten.vercel.app/
- **Admin dashboard**: PASS — status=200 latencyMs=219 url=https://football-ai-ten.vercel.app/admin
- **Health API (public)**: PASS — status=200 latencyMs=1068 url=https://football-ai-ten.vercel.app/api/data/health

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

- [Code Health] npm test: tConfigService.lifecycle.test.ts && tsx lib/healthCheck/supabaseHealthCheck.test.ts && tsx lib/supabase/services/weightConfigService.test.ts && tsx lib/admin/weightConfigAdminApi.test.ts && tsx lib/ad
- [Code Health] npm run validate:system: overall=FAIL
- [Supabase] Connection probe: TypeError: fetch failed

## Deferred Improvements

- [Code Health] npm run lint
- [LocalStorage] football-ai-match-records
- [LocalStorage] football-ai-beta-recommendations
- [LocalStorage] football-ai-beta-rolling-reports
- [LocalStorage] Cross-device sync
- [Database Quality] Active match_records reachable