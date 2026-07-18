# Football AI — Project Audit Report

**Date:** 2026-07-19  
**Scope:** Inspection / Audit only (no code, schema, or data changes)  
**Project path:** `C:\Users\user\Desktop\football-ai\football-ai`  
**Auditor:** Automated codebase + live Supabase read-only inspection

---

## 1. Executive Summary

Football AI v1.0 Beta is a **large, test-heavy Next.js monolith** (~767 source-like files) with a **working production path through Vercel Cron → scheduler libs → Supabase admin client**, and a **separate browser path that persists match history only to LocalStorage**.

**Build and core unit tests pass.** ESLint reports **4 errors / 78 warnings** (mostly scripts). Live Supabase currently has **`match_records = 0`** (recently cleared), but **94 `team_profiles`**, **52 `execution_logs`**, and **stale admin snapshots** remain.

### Top risks before formal production data accumulation

| Priority | Issue |
|----------|-------|
| **Critical** | Homepage manual analysis writes/reads **LocalStorage only** — not Supabase Source of Truth |
| **Critical** | UI label says "Supabase 優先" but browser `loadMatchHistoryComposite()` never loads Supabase |
| **High** | Admin Dashboard pending counts come from **cron snapshot**, can lag after DB changes |
| **High** | `feature_provider_cache` referenced in code but **no migration** in repo |
| **High** | `database.types.ts` covers **5/12 tables** — widespread `as "match_records"` casts |
| **High** | In-memory scheduler lock **not durable across serverless instances** |
| **Medium** | 20 API routes exist; **production UI bypasses almost all of them** |
| **Medium** | All scheduler date keys use **UTC** — timezone edge cases for APAC kickoffs |

### Verdict

**Scheduler + Supabase cron path is production-capable** for automated daily analysis and result verification.  
**Homepage Dashboard is not a Supabase dashboard** and must not be used as formal production metrics until browser persistence is reconciled or explicitly scoped as dev-only.

---

## 2. Project File Counts

| Directory | Files | Role |
|-----------|------:|------|
| `app/` | 42 | Next.js pages + 20 API routes |
| `components/` | 9 | Admin / replay UI components |
| `lib/` | 582 | Core business logic |
| `scripts/` | 94 | CLI tests, health checks, ops |
| `supabase/` | 11 | 10 migrations + cleanup SQL |
| `public/` | 5 | Static assets |
| **Total (excl. node_modules, .next, artifacts)** | **~767** | |

### Major `lib/` modules

| Module | Files | Production relevance |
|--------|------:|---------------------|
| `providers/` | 99 | API-Football, free mode, caches |
| `recommendation/` | 97 | V1 engine + market engine/knowledge |
| `scheduler/` | 35 | Cron pipelines, locks, queues |
| `supabase/` | 37 | Admin client, services, mappers |
| `analysis/` | 48 | Parser → features → report |
| `replay/` | 23 | Replay + V3 validation |
| `admin/` | 24 | Dashboard, ops, cron aggregation |
| `decision/` | 18 | V1 + V3 shadow |
| `evidence/` | 26 | V1 + V3 shadow |

---

## 3. Main Directories & Purpose

| Path | Purpose |
|------|---------|
| `app/page.tsx` | User manual analysis UI |
| `app/admin/*` | Admin dashboards (SSR lib calls) |
| `app/api/admin/cron/*` | Vercel Cron entry (4 jobs) |
| `app/api/data/*` | Admin-key CRUD + health |
| `lib/database/*` | LocalStorage + composite storage router |
| `lib/production/*` | Cron production store + daily pipeline |
| `lib/scheduler/*` | Daily analysis, result update, backfill |
| `lib/supabase/*` | Supabase admin, services, queries, mappers |
| `supabase/migrations/` | Schema source of truth in repo |

---

## 4. Complete Feature List (Production vs Shadow)

### Production (V1 live path)

- Manual analysis: `analyzeMatch` → `featureRecommendationPipeline` → evidence V1 → recommendation V1 → decision V1
- Daily scheduler: fixture intake → odds → analyze → `saveMatchFromAnalysisInSupabase`
- Result scheduler: truly-pending filter → API-Football results → `verifyMatchInSupabase`
- Historical backfill: cursor-based fixture import
- Admin dashboard: Supabase snapshots + daily summaries
- Weight config: DB-backed runtime weights (optional)
- Beta recommendation mode: parallel beta localStorage path

### Shadow / offline (env-gated)

- Evidence V3: `USE_EVIDENCE_V3_SHADOW`
- Decision V3: `USE_DECISION_V3_SHADOW`
- Recommendation dual-write: `RECOMMENDATION_DUAL_WRITE`
- Replay V3 validation: `scripts/run-decision-v3-replay-validation.ts`

### No V2 directory — parallelism is V1 vs V3 only.

---

## 5. Complete Data Flows

### A. User manual analysis

```
app/page.tsx
  → analyzeMatch(rawOdds)
  → parser → normalization → (optional) fetchTeamDataClient (server action, no HTTP /api/football)
  → featureRecommendationPipeline (evidence + recommendation + decision V1)
  → persistAnalysisToHistory
  → compositeMatchStorage.saveMatchFromAnalysisComposite
       Browser: saveMatchIfNewLocally → LocalStorage ONLY (storage: "local")
       Server: saveMatchFromAnalysisInSupabase → Supabase
  → refreshHistory → loadMatchHistoryComposite
       Browser: LocalStorage ONLY
       Server: listMatchRecordsFromSupabase
  → StatsSection ← buildMatchHistoryStats(records)
```

**Inconsistency:** UI text says Supabase-first; browser path is LocalStorage-only (RC2 comment in `compositeMatchStorage.ts:58-61`).

### B. Daily Analysis (cron)

```
Vercel Cron 00:00 UTC
  → POST /api/admin/cron/daily-analysis
  → requireCronAuthAndRateLimit (CRON_SECRET + SCHEDULER_ENABLED)
  → runDailyScheduler
  → API-Football fixtures + odds
  → dailyAnalysisQueue (scheduler_state)
  → syncQueueWithExistingRecords (duplicate skip)
  → analyzeMatch → saveMatchFromAnalysisInSupabase
  → on queue complete: runAdminDailyCron
```

### C. Historical Backfill

```
Vercel Cron 02:00 UTC
  → /api/admin/cron/historical-match-backfill
  → runHistoricalMatchBackfillScheduler
  → historicalBackfillService → match_records (source: historical_backfill)
  → duplicate guards: uq_match_records_fixture_id, uq_match_records_active_key
```

### D. Result Verification

```
Vercel Cron 15:00 UTC
  → /api/admin/cron/result-update
  → runResultScheduler
  → listPendingFromSupabase → filterTrulyPendingVerificationRecords
  → API-Football finished fixtures (FT/AET/PEN)
  → verifyMatchInSupabase (only status=PENDING)
  → runAdminDailyCron
```

### E. Replay

```
app/replay/[matchId]/page.tsx OR scripts
  → getReplayForMatch (lib direct, not HTTP)
  → adminRecordLoader / Supabase
  → replayService rebuild from analysis_snapshot
V3 offline:
  → decisionV3ReplayValidationLoader (paginated Supabase read)
  → eligibility → Legacy vs V3 comparison → JSON artifact
```

### F. Dashboards — data sources

| Dashboard | Data source | Formal SOT? |
|-----------|-------------|-------------|
| **Homepage StatsSection** | Browser **LocalStorage** via `loadMatchHistoryComposite` | **No** — not Supabase |
| **Homepage BetaDashboard** | Beta **LocalStorage** (`betaLocalStorage.ts`) | **No** |
| **Admin `/admin`** | Supabase **`admin_system_snapshots`** + **`admin_daily_summaries`** | **Yes** (snapshot may stale) |
| **Admin Operations** | Lib `getSchedulerStatus` + Supabase execution logs | **Yes** |
| **Replay page** | Supabase via `getReplayForMatch` | **Yes** |

---

## 6. Supabase Schema Audit

### Live DB state (read-only, 2026-07-19)

| Table | Row count |
|-------|----------:|
| `match_records` | **0** |
| `beta_recommendations` | 0 |
| `beta_rolling_reports` | 0 |
| `recommendation_learning` | 0 |
| `team_profiles` | 94 |
| `execution_logs` | 52 |
| `scheduler_state` | 5 |
| `admin_daily_summaries` | 3 |
| `admin_system_snapshots` | 1 |
| `admin_error_logs` | 46 |
| `security_rate_limit_buckets` | 43 |
| `weight_config_versions` | 0 |

**Note:** `feature_provider_cache` — **not present** in live `public` tables list (code references it).

### `match_records` live columns (matches migrations 001+007)

`id`, `match_date`, `league`, `home_team`, `away_team`, `status`, `raw_odds`, `market_selections`, `candidates`, `analysis_snapshot`, `result`, `verification_result`, `legacy_date`, `source`, `schema_version`, `created_at`, `updated_at`, `fixture_id`, `league_id`, `season`, `home_team_id`, `away_team_id`

### Constraints & indexes (verified live)

- **PK:** `id` uuid
- **Status check:** PENDING | VERIFIED | FAILED | CANCELLED
- **Unique partial:** `uq_match_records_active_key` on `(match_date, home_team, away_team) WHERE status <> 'CANCELLED'`
- **Unique partial:** `uq_match_records_fixture_id` on `fixture_id WHERE fixture_id IS NOT NULL`
- **Indexes:** `status`, `created_at DESC`, `match_date`, partial `fixture_id`
- **FK inbound:** `beta_recommendations`, `recommendation_learning` → `ON DELETE RESTRICT`

### RLS

- All 12 tables: **RLS enabled**
- **RLS policies:** **0** (default deny anon/auth; `service_role` bypasses)
- P0 tables also **FORCE RLS** in migration 001

### Triggers / functions / views

- **None** in migrations or live DB

### Schema drift: migrations vs `database.types.ts` vs code

| Table | In migrations | In database.types.ts | Code uses | Drift |
|-------|:-------------:|:--------------------:|:---------:|-------|
| match_records | ✓ | ✓ | ✓ | None |
| beta_recommendations | ✓ | ✓ | ✓ | None |
| beta_rolling_reports | ✓ | ✓ | ✓ | None |
| recommendation_learning | ✓ | ✓ | ✓ | None |
| weight_config_versions | ✓ | ✓ | ✓ | None |
| team_profiles | ✓ | ✗ | ✓ | **Untyped** |
| admin_* / execution_logs / scheduler_state / security_rate_limit_buckets | ✓ | ✗ | ✓ | **`as "match_records"` cast** |
| feature_provider_cache | ✗ | ✗ | ✓ | **Missing migration** |
| validation_entries / validation_reports | ✗ | ✗ | cleanup script only | **Dead reference** |

### `pendingPolicy` round-trip

- Stored in `analysis_snapshot` JSONB
- `matchRecordRowToDomain` → `normalizeHistoricalMatchRecord` **preserves** via spread
- `matchRecordDomainToRow` writes full snapshot back
- **Verified in code**; no dedicated mapper unit test for round-trip

### CASCADE / truncate risks

- `production_init_cleanup.sql` truncates 7 tables but **omits `recommendation_learning`** → orphan risk if learning rows exist
- References non-existent `validation_entries`, `validation_reports`
- FK RESTRICT prevents deleting `match_records` with child rows

---

## 7. API Audit (20 routes)

| Route | Methods | Auth | Production consumer |
|-------|---------|------|---------------------|
| `/api/admin/cron/daily-analysis` | GET,POST | CRON_SECRET | **Vercel Cron** |
| `/api/admin/cron/result-update` | GET,POST | CRON_SECRET | **Vercel Cron** |
| `/api/admin/cron/daily-summary` | GET,POST | CRON_SECRET | **Vercel Cron** |
| `/api/admin/cron/historical-match-backfill` | GET,POST | CRON_SECRET | **Vercel Cron** |
| `/api/admin/dashboard` | GET | Admin (optional off) | **None** — page uses lib |
| `/api/admin/learning-report` | GET | Admin (optional off) | **None** |
| `/api/admin/scheduler` | GET | Admin key | **None** |
| `/api/admin/repair-implied-probability` | POST | Admin + rate limit | Ops scripts |
| `/api/admin/weight-config/*` (5) | GET/POST | Admin key | Tests only |
| `/api/data/match-records` | GET,POST,PATCH | Admin key | Test scripts / external probes |
| `/api/data/beta-*` | GET,POST,PATCH | Admin key | Test scripts |
| `/api/data/import` | POST | Admin + rate limit | Script uses lib directly |
| `/api/data/health` | GET,POST | GET partial public | Health runners |
| `/api/replay/[matchId]` | GET | Admin key | **None** — page uses lib |
| `/api/football/team-data` | POST | Admin + rate limit | **None** — server action |

**Dead HTTP wrappers:** `lib/database/supabaseMatchApi.ts`, `lib/beta/supabaseBetaApi.ts` (0 imports, missing auth headers).

---

## 8. Scheduler / Cron Audit

### Vercel schedules (`vercel.json`, UTC)

| Job | Schedule | Handler |
|-----|----------|---------|
| daily-analysis | `0 0 * * *` | `runDailyScheduler` |
| historical-match-backfill | `0 2 * * *` | `runHistoricalMatchBackfillScheduler` |
| result-update | `0 15 * * *` | `runResultScheduler` |
| daily-summary | `0 16 * * *` | `runAdminDailyCron` |

### Idempotency

- Queue cursor + completed fixture IDs in `scheduler_state`
- `saveMatchIfNewInSupabase` duplicate detection
- `verifyMatchInSupabase` skips non-PENDING
- In-memory lock per job (30 min TTL) — **weak on multi-instance**

### Retry / timeout

- `withRetry`: default 3 attempts, linear backoff
- Per-fixture timeout 60s; job timeout 15 min; time budget 4 min/run
- Unprocessed fixtures defer to next cron

### Pending policy

- Result scheduler uses `filterTrulyPendingVerificationRecords` ✓
- Admin cron uses `countTrulyPendingVerification` ✓

### Timezone

- All `todayKey()` = `toISOString().slice(0,10)` → **UTC date**
- APAC evening matches may land on adjacent UTC date

---

## 9. Environment Audit

### Required for production (from `envAudit.ts` + `.env.example`)

| Variable | Server-only | In .env.example | Missing behavior |
|----------|:-----------:|:---------------:|------------------|
| `SUPABASE_URL` | ✓ | ✓ | Cron/scheduler skip or fail |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✓ | No Supabase access |
| `SUPABASE_DB_URL` | ✓ | ✓ (commented) | Weight config transactions fail |
| `API_FOOTBALL_KEY` | ✓ | ✓ | Scheduler cannot fetch fixtures |
| `ADMIN_API_KEY` | ✓ | ✓ | Admin APIs return 401 |
| `CRON_SECRET` | ✓ | ✓ | Cron routes return 401 |
| `SCHEDULER_ENABLED` | ✓ | ✓ | Cron blocked if `false` |

### Browser-exposed (safe)

- `NEXT_PUBLIC_BETA_RECOMMENDATION_MODE`
- No `NEXT_PUBLIC_SUPABASE_*` in active path (correct)

### Security checks

- Health runner checks `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` exposure ✓
- `SUPABASE_SERVICE_ROLE_KEY` only in server modules ✓
- `ADMIN_DASHBOARD_REQUIRE_AUTH=false` disables admin page auth — **risk if set in prod**

### Not in .env.example but used

- `HEALTH_CHECK_PRODUCTION_URL`
- `TEAM_PROFILE_QUOTA_WAIT_MS`
- `VERCEL_*` (platform-injected)

---

## 10. Test / Build Results

| Command | Result |
|---------|--------|
| `npm test` | **PASS** (all chained test files) |
| `npm run build` | **PASS** (Next.js 16.2.10, TypeScript OK) |
| `npm run lint` | **FAIL** — 4 errors, 78 warnings (mostly scripts) |

### Test coverage gaps

| Area | Coverage |
|------|----------|
| `matchRecordMapper` pendingPolicy round-trip | Indirect only |
| API route integration | `test-security.ts` imports routes; no full HTTP E2E |
| Cron end-to-end | Script tests with mocks; no live cron test |
| Browser LocalStorage ↔ Supabase consistency | **No test** |
| Homepage stats vs Supabase stats | **No test** |
| `feature_provider_cache` | **No migration test** |
| Replay loader pagination/retry | **Has tests** ✓ |
| Pending policy | **Has tests** ✓ |
| Decision V3 dual-write | **Has tests** ✓ |

### Skipped / flaky

- No `.only` / `.skip` found in lib tests
- Supabase fetch failures in replay/cleanup tests are **mocked/intentional** console noise

---

## 11. Dead Code / Duplicate Code

### Confirmed dead (zero imports)

- `lib/database/historyStorage.ts`
- `lib/database/supabaseMatchApi.ts`
- `lib/beta/supabaseBetaApi.ts`
- `lib/analysis/rules/bttsRules.ts`, `confidence.ts`, `handicapRules.ts`, `moneylineRules.ts`, `totalGoalsRules.ts`
- `lib/knowledgeLayers/index.ts`
- Multiple unused `index.ts` barrels

### Duplicate implementations

| Concern | Locations |
|---------|-----------|
| Stats | `buildMatchHistoryStats`, `buildProductionDashboard`, `computeStatistics`, `computeBetaDashboardStats` |
| Pending lists | `resultUpdatePipeline`, `inMemoryProductionStore`, `historicalPendingCleanupService` |
| Supabase read | `queries/matchRecords.ts` vs inline in services |
| HTTP vs lib | 6 admin/data routes mirror direct lib calls used by pages |

---

## 12. Security Findings

| ID | Severity | Issue |
|----|----------|-------|
| SEC-01 | **Critical** | Browser analysis never writes Supabase — formal data bypasses secured server path |
| SEC-02 | **High** | `ADMIN_DASHBOARD_REQUIRE_AUTH=false` makes admin dashboard public |
| SEC-03 | **Medium** | `GET /api/data/health` returns `{ok:true}` without auth (by design; limited leak) |
| SEC-04 | **Medium** | Dead `supabaseMatchApi.ts` would call APIs without `x-admin-key` if wired |
| SEC-05 | **Low** | Legacy test scripts call data APIs without admin key header |
| SEC-06 | **Low** | RLS enabled, no policies — safe only while ** exclusively using service_role server-side** |

---

## 13. Production Risks

| ID | Severity | Issue |
|----|----------|-------|
| PROD-01 | **Critical** | **No Single Source of Truth for homepage** — LocalStorage vs Supabase split |
| PROD-02 | **High** | Admin snapshot stale after manual DB cleanup (pendingCount not auto-refreshed) |
| PROD-03 | **High** | `feature_provider_cache` may not exist on fresh deploy |
| PROD-04 | **High** | In-memory scheduler lock ineffective across Vercel concurrent instances |
| PROD-05 | **Medium** | UTC date keys vs local kickoff times |
| PROD-06 | **Medium** | `SCHEDULER_MAX_FIXTURES_PER_RUN=3` — slow accumulation |
| PROD-07 | **Medium** | `USE_REAL_SCHEDULER_ODDS=false` default — mock odds in scheduler |
| PROD-08 | **Medium** | `team_profiles` (94 rows) not cleared with match_records — stale context |
| PROD-09 | **Low** | No automated backup documented beyond Supabase platform |
| PROD-10 | **Low** | `production_init_cleanup.sql` stale vs current schema |

---

## 14. Missing Connections

| ID | Severity | Gap |
|----|----------|-----|
| MISS-01 | **Critical** | Homepage `persistAnalysisToHistory` → LocalStorage; **no link to Supabase** in browser |
| MISS-02 | **Critical** | Homepage `loadPersistedHistory` → LocalStorage; **never reads Supabase** in browser |
| MISS-03 | **High** | 14 of 20 API routes have **no production UI consumer** |
| MISS-04 | **High** | `supabaseMatchApi.ts` / `supabaseBetaApi.ts` — HTTP clients **never connected** |
| MISS-05 | **Medium** | Admin pending count requires **manual/triggered** `runAdminDailyCron` after data changes |
| MISS-06 | **Medium** | `feature_provider_cache` code path **may fail** if table missing |
| MISS-07 | **Low** | `validation_entries/reports` in cleanup script — **tables don't exist** |

---

## 15. Detailed Issue Register

### AUD-001
- **Severity:** Critical
- **Path:** `lib/database/compositeMatchStorage.ts` (lines 58–107)
- **Problem:** Browser clients save/load match history from LocalStorage only, despite `STORAGE_POLICY = "supabase-first"`.
- **Evidence:** `saveMatchFromAnalysisComposite` browser branch calls `saveMatchIfNewLocally`; `loadMatchHistoryComposite` returns `loadMatchHistoryLocally()` with `storage: "local"`.
- **Impact:** Manual analyses on homepage **do not enter Supabase**; Dashboard stats reflect LocalStorage, not production DB.
- **Fix:** Wire browser to admin API or server action for Supabase writes; or document homepage as dev-only.
- **Blocks production:** **Yes** (if homepage is primary input channel)

### AUD-002
- **Severity:** Critical
- **Path:** `app/page.tsx` + `lib/database/browserPersistence.ts`
- **Problem:** UI displays "Supabase 優先" while always loading LocalStorage on client.
- **Evidence:** `"use client"` page → `loadPersistedHistory()` → composite browser branch.
- **Impact:** Operators believe they see Supabase data; they see per-browser LocalStorage.
- **Fix:** Align UI label with actual storage; or implement Supabase read on refresh.
- **Blocks production:** **Yes** (operational confusion)

### AUD-003
- **Severity:** High
- **Path:** `lib/admin/runAdminDailyCron.ts` → `admin_system_snapshots`
- **Problem:** Admin pending count comes from snapshot, not live query on page load.
- **Evidence:** `app/admin/page.tsx` uses `buildAdminDashboardResponse()` reading stored snapshot.
- **Impact:** After DB cleanup or bulk changes, admin shows stale pending until cron runs.
- **Fix:** Re-run daily-summary cron or read live counts on dashboard.
- **Blocks production:** **No** (but misleading metrics)

### AUD-004
- **Severity:** High
- **Path:** `lib/providers/*Cache*.ts` + migrations
- **Problem:** `feature_provider_cache` used in code but no migration creates it.
- **Evidence:** Grep in `supabase/migrations/` — no match; live DB table list excludes it.
- **Impact:** Provider cache writes may fail silently or fall back depending on code path.
- **Fix:** Add migration or remove references.
- **Blocks production:** **Partial** (scheduler enrichment may degrade)

### AUD-005
- **Severity:** High
- **Path:** `lib/supabase/database.types.ts`
- **Problem:** Only 5/12 public tables typed; 7 tables use `as "match_records"` workaround.
- **Evidence:** `executionLogStore.ts`, `adminDashboardStore.ts`, `rateLimiter.ts`, etc.
- **Impact:** Schema drift undetected at compile time; refactor risk.
- **Fix:** Extend `Database` type code-gen or manual types.
- **Blocks production:** **No**

### AUD-006
- **Severity:** High
- **Path:** `lib/scheduler/schedulerLock.ts`
- **Problem:** In-memory lock does not coordinate across serverless function instances.
- **Evidence:** Lock stored in process memory, not Supabase/Redis.
- **Impact:** Concurrent cron invocations possible on Vercel; duplicate work or race.
- **Fix:** DB-backed lock or Vercel cron concurrency limit.
- **Blocks production:** **Partial**

### AUD-007
- **Severity:** Medium
- **Path:** `lib/supabase/services/matchRecordPendingPolicy.ts` + `todayKey()`
- **Problem:** All pending date logic uses UTC calendar date.
- **Evidence:** `todayKey = date.toISOString().slice(0,10)`.
- **Impact:** Edge cases for UTC+8 operators around midnight UTC.
- **Fix:** Document or use configured timezone for match_date comparison.
- **Blocks production:** **No**

### AUD-008
- **Severity:** Medium
- **Path:** `supabase/scripts/production_init_cleanup.sql`
- **Problem:** References non-existent tables; omits `recommendation_learning`.
- **Evidence:** Script lists `validation_entries`; migration has no such table.
- **Impact:** Cleanup script partially fails or leaves orphans.
- **Fix:** Update script to match migrations 001–010.
- **Blocks production:** **No** (manual ops only)

### AUD-009
- **Severity:** Medium
- **Path:** 20 × `app/api/**/route.ts`
- **Problem:** Production UI calls lib functions directly; HTTP API layer largely unused.
- **Evidence:** Grep `app/` + `components/` — zero `/api/` fetch calls.
- **Impact:** API surface untested in prod flows; dead wrappers accumulate.
- **Fix:** Consolidate or document API as external/cron-only.
- **Blocks production:** **No**

### AUD-010
- **Severity:** Medium
- **Path:** `lib/scheduler/schedulerConfig.ts` + `.env.example`
- **Problem:** `USE_REAL_SCHEDULER_ODDS=false` by default — scheduler uses mock odds.
- **Evidence:** `.env.example` line 42.
- **Impact:** Automated daily analysis may not use real market odds until enabled.
- **Fix:** Set `USE_REAL_SCHEDULER_ODDS=true` for production.
- **Blocks production:** **Yes** (if real odds required)

### AUD-011
- **Severity:** Low
- **Path:** `lib/database/historyStorage.ts`, `lib/database/supabaseMatchApi.ts`
- **Problem:** Dead code — zero imports.
- **Evidence:** Import graph analysis.
- **Impact:** Maintenance noise.
- **Fix:** Remove in future cleanup PR.
- **Blocks production:** **No**

### AUD-012
- **Severity:** Low
- **Path:** ESLint across project
- **Problem:** 4 lint errors (e.g. `require()` in `scripts/test-security.ts`).
- **Evidence:** `npm run lint` exit code 1.
- **Impact:** CI quality gate if lint enforced.
- **Fix:** Fix script lint issues.
- **Blocks production:** **No**

---

## 16. Summary Table

| ID | Severity | Area | Problem | Blocks Production |
|----|----------|------|---------|:-----------------:|
| AUD-001 | Critical | Storage | Browser uses LocalStorage only for match records | **Yes** |
| AUD-002 | Critical | UI | Misleading "Supabase-first" label vs LocalStorage reality | **Yes** |
| AUD-003 | High | Admin | Snapshot stale pending counts | No |
| AUD-004 | High | Schema | `feature_provider_cache` missing migration | Partial |
| AUD-005 | High | Types | `database.types.ts` incomplete | No |
| AUD-006 | High | Scheduler | In-memory lock not distributed | Partial |
| AUD-007 | Medium | Timezone | UTC-only date keys | No |
| AUD-008 | Medium | Ops SQL | Stale production cleanup script | No |
| AUD-009 | Medium | API | Unused HTTP routes vs lib-direct UI | No |
| AUD-010 | Medium | Scheduler | Mock odds default in scheduler | **Yes** (if real odds needed) |
| AUD-011 | Low | Dead code | Unused modules | No |
| AUD-012 | Low | Lint | ESLint errors in scripts | No |
| SEC-01 | Critical | Security | Browser bypasses Supabase write path | **Yes** |
| SEC-02 | High | Security | Admin auth disable flag | Partial |
| MISS-01 | Critical | Integration | Homepage not connected to Supabase | **Yes** |
| MISS-02 | Critical | Integration | Homepage not reading Supabase | **Yes** |
| PROD-01 | Critical | SOT | No unified data source for UI | **Yes** |

---

## 17. Final Answers

### 1. 現在是否可以開始正式累積資料？

**可以，但僅限 Cron / Scheduler → Supabase 路徑。**  
`match_records` 已清空（0 筆），適合重新累積。  
**不建議**把首頁手動分析當正式資料入口，除非先解決 LocalStorage 分裂問題（AUD-001）。

### 2. 是否存在會導致資料漏存的問題？

**是。** 瀏覽器手動分析只寫 LocalStorage，**不寫 Supabase**（AUD-001）。Cron 路徑正常寫 Supabase。

### 3. 是否存在會導致重複資料的問題？

**低風險。** DB 有 `uq_match_records_active_key`、`uq_match_records_fixture_id`；`saveMatchIfNewInSupabase` 有應用層 duplicate 處理。  
**殘餘風險：** serverless 多實例 lock（AUD-006）、CANCELLED 行可重複 active key。

### 4. 是否存在 LocalStorage / Supabase 資料分裂？

**是 — 這是目前最大架構問題（PROD-01）。**  
首頁 Dashboard 讀 LocalStorage；Scheduler / Admin / Replay 讀 Supabase。

### 5. Scheduler 是否真的會運作？

**是** — 若 Vercel 部署、`CRON_SECRET`、`SCHEDULER_ENABLED=true`、API-Football key 配置正確。  
4 條 cron 已在 `vercel.json` 註冊。需確認 Production env 與 `USE_REAL_SCHEDULER_ODDS`（AUD-010）。

### 6. Result Verification 是否真的會運作？

**是** — `runResultScheduler` 使用 `filterTrulyPendingVerificationRecords`，只驗證 truly pending，且 `verifyMatchInSupabase` 僅更新 `PENDING` 記錄。

### 7. Replay 是否真的會讀到正式資料？

**是** — `getReplayForMatch` / V3 loader 從 Supabase 讀 `match_records`（server-side lib path）。  
目前 DB 為 0 筆，replay 無資料可讀直到 scheduler 寫入。

### 8. Dashboard 是否顯示正式資料？

| Dashboard | 正式資料？ |
|-----------|:----------:|
| 首頁 StatsSection | **否** — LocalStorage |
| 首頁 Beta | **否** — LocalStorage |
| Admin | **是** — Supabase snapshot（可能過期） |
| Operations | **是** — Supabase logs/state |

### 9. Supabase schema 是否與程式一致？

**大部分一致** — live `match_records` 欄位與 mapper 對齊。  
**漂移：** 7 表未 typed、`feature_provider_cache` 缺 migration、cleanup script 過時。

### 10. 必須先修 vs 可延後

#### 必須先修（阻擋正式運作或資料正確性）

1. **AUD-001 / MISS-01 / MISS-02** — 決定正式資料入口：Cron-only **或** 接通 browser→Supabase
2. **AUD-002** — 修正首頁 storage 說明或行為
3. **AUD-010** — Production 啟用真實 scheduler odds（若需要）
4. **AUD-003** — 清空 DB 後重跑 `daily-summary` cron 更新 admin snapshot

#### 可延後

- Dead code removal (AUD-011)
- Complete database.types.ts (AUD-005)
- API route consolidation (AUD-009)
- ESLint script fixes (AUD-012)
- production_init_cleanup.sql update (AUD-008)
- Distributed scheduler lock (AUD-006) — monitor first

---

## 18. Audit Artifacts

- Live Supabase read-only inspection performed via `SUPABASE_DB_URL` (no writes)
- `npm test` — pass
- `npm run build` — pass
- `npm run lint` — 4 errors, 78 warnings
- Temporary audit script: `scripts/_temp-audit-supabase-readonly.ts` (read-only; may be deleted after review)

---

*End of audit. No code, schema, migrations, or Supabase data were modified during this inspection.*
