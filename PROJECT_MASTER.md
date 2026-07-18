# Football AI Project Master

Project Name:
Football AI

Current Version:
v1.0 Beta

Status:
READY FOR DATA COLLECTION

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

Phase 2-A
Real Scheduler Odds Integration
✅ COMPLETED / SEALED

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

Phase 3-6
Operations Dashboard (v1.0 Beta)
✅ COMPLETED / SEALED

v1.0 Beta
Core Development Complete
✅ READY FOR DATA COLLECTION

After v1.0 Beta:
- Stop adding core features
- Focus on data collection and replay validation
- Do not promote Decision V3 to Production primary without Phase 3-4.5 evidence

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
- Phase 2-A — Real Scheduler Odds Integration (SEALED — see docs/SCHEDULER_ODDS_RUNBOOK.md)
- Phase 3-0 — Evidence/Decision V3 Architecture Design (SEALED)
- Phase 3-1 — Evidence V3 Shadow Mode (SEALED)
- Phase 3-2 — Decision V3 Read-Only Shadow (SEALED)
- Phase 3-3 — Decision Weight Bridge (SEALED)
- Phase 3-4 — Dual-Write Scoring (SEALED)
- Phase 3-4.5 — Replay Validation (SEALED — INSUFFICIENT_DATA pending real match records)
- Phase 3-6 — Operations Dashboard (SEALED — `/admin/operations`)
- Data Completeness Guard — Daily Analysis enrichment for incomplete historical backfill rows (see docs/REPLAY_DATA_SOURCE_POLICY.md)

Replay data source policy:
docs/REPLAY_DATA_SOURCE_POLICY.md

==================================

Phase 2-A — Real Scheduler Odds Integration

Status:
COMPLETED / SEALED

Suggested tag:
v2.0-scheduler-odds

Runbook:
docs/SCHEDULER_ODDS_RUNBOOK.md

1. Final data flow

SchedulerFixtureSource
→ OddsQuery
→ SchedulerOddsResolver
→ OddsProvider
→ ApiFootballOddsAdapter
→ OddsData[]
→ SchedulerRawOddsFormatter
→ rawOdds
→ ProductionFixture
→ analyzeMatch()

2. Production enable

USE_REAL_SCHEDULER_ODDS=true
SCHEDULER_ODDS_SOURCE=api-football

Optional:

SCHEDULER_ODDS_BOOKMAKER_ID=8

3. Rollback

USE_REAL_SCHEDULER_ODDS=false

(No rebuild, redeploy, or DB migration required.)

4. Observability

schedulerOdds:
{
  source,
  total,
  resolved,
  fallback,
  providerErrors
}

Recorded in daily scheduler execution log context. Does not log API keys, full odds, marketSelections, or bookmaker details.

5. Production Proof

date: 2026-07-18
fixtureId: 1490329
source: api-football
resolved: 1
fallback: 0
providerErrors: 0
isPlaceholder: false
analyzeMatchPassed: true

Command: `npm run test:scheduler-odds:production-proof`

6. Known limitations

- API-Football Free plan quota
- Minute request limit (10/min in-process gate)
- After provider blocked in one scheduler run, remaining fixtures in that run fallback to placeholder
- Per-fixture lookup may add API requests (fixture metadata for team names)
- Bookmaker is single deterministic selection (no consensus)
- No persistent odds cache yet
- Gemini health optional — credits depleted is non-blocking for this phase
- Supabase health issues, if still present, are pre-existing environment issues (see HEALTH_CHECK_REPORT.md)

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

Phase 3-6 — Operations Dashboard (v1.0 Beta)

Status:
✅ COMPLETED / SEALED

Route:
- `/admin/operations`

Purpose:
- Read-only monitoring dashboard for production operations
- Does NOT modify Recommendation, Decision, Learning, Replay, Scheduler, Parser, Weight, or Evidence

Sections:
- Scheduler (today fixtures, success/failure, next run)
- Production (Legacy / Decision Shadow / Agreement %)
- Replay (Eligible, VERIFIED total, replay verdict)
- Provider (API-Football quota, Google Search, Supabase, Scheduler health)
- Decision (Shadow ON/OFF, Weight Version, Runtime/Fallback)
- Evidence (Catalog Version, supported IDs, shadow status)
- System (Version, Git Commit, Build, Last Validation, Environment)

Data sources (read-only):
- `getSchedulerStatus()`, `buildAdminDashboardResponse()`, `loadAdminMatchRecords()`
- Artifacts: `artifacts/decision-v3-replay-validation.json`, `artifacts/health-check-report.json`, `artifacts/system-validation-report.json`
- Env flags: `USE_EVIDENCE_V3_SHADOW`, `USE_DECISION_V3_SHADOW`, `RECOMMENDATION_DUAL_WRITE`

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

v1.0 Beta — Data Collection

- Accumulate VERIFIED match records in Supabase via Scheduler
- Re-run `npm run validate:decision-v3-replay` when eligible records >= 100
- Monitor via `/admin/operations`
- Do NOT promote Decision V3 to Production primary without replay validation evidence

Previous focus (Phase 2):

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
