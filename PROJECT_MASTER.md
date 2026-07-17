# Football AI Project Master

Project Name:
Football AI

Current Version:
v1.0.0

Status:
Stable

Release:
PASS

Architecture Score:
79 / 100

Maintainability Score:
75 / 100

Current Branch:
main

Current Tag:
v1.0.0

Latest Commit:
10eb5316bcde0a5d5a530546d2c8b550d8158d75

==================================

Repository Root

- Official Git repository: this directory (`football-ai/` when cloned from GitHub).
- Remote: `origin` → `https://github.com/trantran0502/football-ai.git`
- Run all npm commands here (`dev`, `build`, `test`, `validate:system`, `health-check`, `health:supabase`, `health:supabase:production`, `supabase:migrate`, `check:supabase-odds`, `repair:supabase-odds`).
- Do not use a parent `Desktop/football-ai/` wrapper with its own `.git` or stale Next.js scaffold; that outer layer is not connected to GitHub and must not host a second `package.json`.

==================================

Overall Progress

Phase 1
Core System
✅ Completed

Phase 2
Real Data Integration
🟨 In Progress

Phase 3
Evidence Engine
✅ Completed

Evidence Integration
✅ Completed

Evidence Validation
✅ Completed

Evidence Weight Optimizer
✅ Completed

Evidence Learning Integration
✅ Completed

AI Learning v1
✅ Completed

Historical Fundamentals Backtest v1
✅ Completed

Full Production Health Check v1
🟨 PARTIAL PASS

Supabase Recovery and Verification v1
🟨 PARTIAL PASS (Local PASS; Production CRUD requires ADMIN_API_KEY — see PRODUCTION_SUPABASE_VERIFICATION.md)

Production Supabase Verification v1
🟨 MANUAL ACTION REQUIRED

Phase 4
AI Learning
🟨 In Progress

Phase 5
Website Enhancement
🟨 In Progress

==================================

Completed

- Parser
- Market Normalizer
- Asian Handicap Rules
- Cross-Market Validation
- Feature Score Engine
- Feature Fusion
- Recommendation Engine
- Decision Engine
- Explain Engine
- Validation Engine
- Replay Engine
- Batch Learning
- Incremental Learning
- Recommendation Learning
- Learning Engine
- Market Engine
- Market Engine Integration
- Rule Engine
- Pattern Engine
- Knowledge Engine
- Knowledge Layers
- Persistence
- Weight Optimizer
- System Validation
- Release Validation
- Git v1.0.0 Release
- API-Football
- H2H
- Recent 10 Matches
- Home Form
- Away Form
- Team Profile
- Team Engine
- Fixture
- xG
- xGA
- League Strength
- Squad Availability
- Match Context
- Scheduler
- Historical Backfill
- Cache
- Google Gemini Search
- Hybrid Data Resolver
- Admin Dashboard
- Match Records
- LocalStorage
- Supabase Integration
- Production Pipeline
- Betting Intelligence
- Backtest Engine
- Provider Registry
- Provider Weighting
- Security / Auth
- Golden Dataset
- Beta Recommendation Mode
- Evidence Engine
- Evidence Integration
- Evidence Validation
- Evidence Weight Optimizer
- Evidence Learning Integration
- AI Learning v1
- Historical Fundamentals Backtest v1
- Full Production Health Check v1 (PARTIAL PASS — see HEALTH_CHECK_REPORT.md)
- Supabase Recovery v1 (Local CRUD PASS — see SUPABASE_HEALTH_REPORT.md)

==================================

Health Check Policy (v1)

- Run: `npm run health-check`
- Supabase: `npm run health:supabase`
- API-Football: `npm run health:api-football`
- Migrations (optional): `npm run supabase:migrate` with SUPABASE_DB_URL
- Report: `HEALTH_CHECK_REPORT.md`, `SUPABASE_HEALTH_REPORT.md`, `API_FOOTBALL_HEALTH_REPORT.md`
- Full PASS requires: test, build, validate:system, Supabase CRUD, API-Football provider probe, pipeline, production routes, no critical security/leakage
- NOT TESTABLE ≠ PASS; missing local provider keys → PARTIAL PASS
- Do not fake PASS without evidence

==================================

API-Football Verification (v1)

Environment:
- Required: `API_FOOTBALL_KEY` (server-only; never `NEXT_PUBLIC_*`)
- Optional: `API_FOOTBALL_BASE_URL` (default `https://v3.football.api-sports.io`)
- Auth header: `x-apisports-key`

Local verification:
- Script: `npm run health:api-football`
- Runner: `lib/providers/apiFootball/apiFootballHealthRunner.ts`
- Entry script: `scripts/run-api-football-health.ts`
- Low-cost probe: `GET /timezone`
- Provider integration: team lookup, fixture lookup, recent form via `ApiFootballClient`
- Cache probe: in-memory `ApiFootballCacheStore` write/read
- Quota: provider response headers + local `apiFootballQuota` gate (100/day, 10/min)

Production verification:
- Script: `npm run health:api-football:production` (sequential: test → build → authenticated probe)
- Route: `POST /api/data/health` with `{ action: "production-api-football-probe", healthCheckId }` (admin auth required)
- Runner: `lib/providers/apiFootball/productionApiFootballVerification.ts`
- Report: `PRODUCTION_API_FOOTBALL_VERIFICATION.md`
- Vercel Production must have `API_FOOTBALL_KEY` configured server-side; redeploy after env changes

Provider implementation:
- Client: `lib/providers/apiFootball/apiFootballClient.ts`
- Service/cache/quota: `lib/providers/apiFootball/apiFootballService.ts`, `apiFootballCache.ts`, `apiFootballQuota.ts`
- Registry fallback chain includes `apiFootball` after Supabase cache and team profile

==================================

Supabase Recovery Notes (v1)

Root cause of prior FAIL:
- Schema health probe incorrectly used `select('id')` on every table.
- Tables with non-uuid PKs (`scheduler_state.state_key`, `admin_daily_summaries.summary_date`, `admin_system_snapshots.snapshot_key`, `security_rate_limit_buckets.bucket_key`) were reported missing although they exist.
- Intermittent `TypeError: fetch failed` under concurrent `next build` + health-check load.

Fixed:
- `lib/supabase/schemaRegistry.ts` — table probe columns aligned with actual PKs.
- `lib/supabase/supabaseHealthRunner.ts` — full CRUD + relation tests (`npm run health:supabase`).
- `supabase/migrations/009_schema_recovery_verify.sql` — idempotent recovery for admin/scheduler/security tables.

Logical entities (fixture, market snapshot, validation, evidence, etc.) persist in JSON columns on `match_records` / `beta_recommendations` / `recommendation_learning` — not separate tables by design.

Remaining:
- Production authenticated Supabase CRUD: set matching `ADMIN_API_KEY` in `.env.local` and Vercel Production, deploy latest, run `npm run health:supabase:production`.

Production Verification (v1):
- `POST /api/data/health` with `{ action: "production-crud-probe", healthCheckId }` runs insert/select/update/delete on Production Supabase (admin auth required).
- Script: `npm run health:supabase:production` (sequential: test → build → probe).

==================================

Historical Data Policy

- Historical fundamentals may be used for backtesting
- Historical odds are NOT a system dependency
- Odds data is accumulated only after the system starts operating
- Historical Fundamentals learning and Live Market learning must remain permanently separated
- Data Leakage is strictly forbidden (dataTimestamp must be before fixtureDate)

==================================

Current Blocker

- `ADMIN_API_KEY` missing from local `.env.local` — Production CRUD verification blocked until set locally and on Vercel Production (same value).

==================================

Next Task

Phase 2

Real Data Integration

==================================

Roadmap

v1.1

Real Data

↓

v1.2

Evidence Engine

↓

v1.3

AI Learning

↓

v1.4

Dashboard

↓

v2.0

Market AI

==================================
