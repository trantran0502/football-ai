# Football AI v1.0 RC1 — Master Validation Report

**Generated:** 2026-07-17  
**Git commit:** `d71c392`  
**Project root:** `football-ai/football-ai/`  
**Mode:** Validate / Audit / Report only (no code changes)

---

## Release Verdict

| Field | Value |
|-------|-------|
| **Overall** | **FAIL** |
| **Architecture Score** | **64 / 100** |
| **Maintainability Score** | **61 / 100** |
| **Ready for Release** | **No** |

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 5 |
| Medium | 12 |
| Low | 9 |

---

## Automated Gates

| Gate | Result |
|------|--------|
| `npm test` | PASS |
| `npm run build` | PASS (25 routes) |
| `npm run validate:system` | **FAIL** |
| `validate-special-parsers.ts` | PASS |
| `test-partial-markets.ts` | PASS |
| `test-recommendation-engine.ts` | PASS |
| `test-production-validation.ts` | PASS |

---

## Part 1 — Project Audit

| Check | Status | Summary |
|-------|--------|---------|
| Duplicate folders | FAIL | `components/` vs `app/components/`; `database/` vs `lib/database/`; scattered `types/` |
| Second football-ai project | FAIL | Parent `Desktop/football-ai/` has stale Next 15 scaffold (`package.json`, `src/app/`) |
| Orphan files | WARN | `types/analysis.ts` (0 imports); `database/bettingHistory.ts` isolated |
| Unreferenced modules | WARN | `types/analysis.ts`; `runMarketEngine` not in live recommendation path |
| Duplicate interfaces | WARN | `MatchRecordVerifyResult` in two database files |
| Circular dependency | PASS | No cycles detected in manual review |
| Unused exports | WARN | `types/analysis.ts` exports unused |
| Dead code | WARN | Legacy `lib/knowledge/*`; placeholder rules |
| Placeholders | WARN | 8 intentional placeholders (SteamMove, SharpMoney, market history, etc.) |
| TODO / FIXME | PASS | 0 occurrences |

**Unwired scripts:** 18 of 67 `scripts/*.ts` files not referenced in `package.json`.

---

## Part 2 — Architecture Audit

### Module Health

| Module | Coupling | Notes |
|--------|----------|-------|
| Recommendation | Medium | Feature fusion → engine → validation; clean internal layering |
| Validation | Low | Admin dashboards |
| Replay | **High** | Two namespaces: `lib/replay/` vs `marketKnowledge/replay/` |
| Learning | **High** | `lib/learning/` + `recommendationLearning*` + `weightOptimizer` overlap |
| Weight Optimizer | Medium | Admin-only |
| Market Engine | Low (internal) | **Not connected to production pipeline** |
| Rule Engine | Low | Inside marketEngine |
| Pattern Engine | Low | 3/10 patterns never match fixtures |
| Knowledge | Medium | Batch/replay/incremental/persistence cohesive |
| Persistence | Low | Checksum/manifest PASS |
| Incremental | Medium | Individual PASS; consistency FAIL vs batch |

### Key Findings

1. **Dual-stack architecture** — Live pipeline (`parser → features → recommendationEngine`) runs independently of market stack (`marketEngine → marketKnowledge`).
2. **Duplicate responsibility** — `lib/knowledge` vs `marketEngine` analyzers interpret same market concepts.
3. **Naming collisions** — `ReplayStep`, `MarketType`, `MatchStatus` differ by namespace.
4. **Merge candidates** — `marketKnowledgeStore` vs `persistence/` repository layer.
5. **Dependency violation** — `matchSchema.ts` imports replay builder.

---

## Part 3 — Parser Validation

**Status: PASS**

| Market | Result |
|--------|--------|
| 亞洲盤 (AH) | PASS |
| 大小球 (OU) | PASS |
| BTTS | PASS |
| Moneyline (1X2) | PASS |
| 水位 | PASS |
| 半贏 / 半輸 | PASS |
| 平手 / 讓球 | PASS |

Scripts: `validate-special-parsers.ts`, `test-partial-markets.ts` — all checks passed.

Primary implementation: `lib/parser/parser.ts` (897 lines).

---

## Part 4 — Recommendation Validation

**Status: PASS**

| Field | Result |
|-------|--------|
| Candidate | PASS |
| Recommendation | PASS |
| Confidence | PASS (0–1 bounded) |
| Reason | PASS |
| Score | PASS |

Note: `test-production-validation.ts` logged `missing_market_outcomes` for 2 learning records (non-blocking for script exit).

---

## Part 5 — Market Engine Validation

**Engine: PASS** (492/492 checks)  
**Patterns: FAIL** (611 pass, 3 fail)

| Market | AH | OU | BTTS | 1X2 |
|--------|----|----|------|-----|
| Analyzer | PASS | PASS | PASS | PASS |
| Rules | PASS | PASS | PASS | PASS |
| Patterns | PASS* | PASS* | PASS* | PASS* |
| Audit / Score / Risk | PASS | PASS | PASS | PASS |

\*Three pattern IDs never matched across 12 validation fixtures:

- `HomeLowWaterBalanced`
- `BalancedUnderdog`
- `LowOverroundBalanced`

Placeholder rules (`SteamMoveRule`, `SharpMoneyRule`) correctly never trigger.

---

## Part 6 — Knowledge Validation

| Subsystem | Status |
|-----------|--------|
| Batch | PASS |
| Replay | PASS |
| Incremental | PASS (isolated) |
| Statistics | PASS |
| Snapshot | PASS |
| Manifest | PASS |
| Checksum | PASS |
| Repository | PASS |
| Recovery | PASS |

---

## Part 7 — Consistency Validation

**Status: FAIL**

| Pair | Result |
|------|--------|
| Batch vs Replay | **MATCH** |
| Batch vs Incremental | **MISMATCH** |

### First Difference

```
path: patternStatistics → AwayHighWaterValue
field: bestLeague / worstLeague

Batch/Replay:  bestLeague="Premier League",  worstLeague="La Liga"
Incremental:   bestLeague="La Liga",         worstLeague="Premier League"
```

**Root cause (observed):** Incremental snapshot reconstruction from finalized stats loses `leagueHitRates` tie-break detail used by batch aggregation.

**Checksums:**

- Batch / Replay: `1a4e03c3146477a5bfda2c56e7b416891b8ca172c6716a3946a2397d489a2af7`
- Incremental: `51db64c1c179e10e10dd5362a656a9fc50bdd10412541fbce35bd44e19974655`

Additional: `HighOverroundRisk` same league swap; `HomeLowWaterFavorite.roi` float drift at 17th decimal.

---

## Part 8 — Website Validation

**Status: PASS** — No broken routes detected in build.

### Pages

`/`, `/admin`, `/admin/recommendation-learning`, `/admin/recommendation-learning-backfill`, `/admin/recommendation-learning-debug`, `/admin/recommendation-validation`, `/admin/system-health`, `/admin/weight-optimizer`, `/replay/[matchId]`

### API Routes (15)

All `/api/admin/*`, `/api/data/*`, `/api/replay/*`, `/api/football/team-data` compiled successfully.

LocalStorage persistence: validated via standalone script (not in default `npm test`).

---

## Part 9 — Performance Audit

### Large Files

| File | Lines |
|------|-------|
| `scripts/test-team-profile.ts` | 1815 |
| `scripts/test-scheduler.ts` | 1514 |
| `lib/systemValidation/systemValidationRunner.ts` | 1154 |
| `lib/teamProfile/teamProfileDataSource.ts` | 1149 |
| `lib/recommendation/marketKnowledge/marketKnowledgeStatistics.ts` | 931 |
| `lib/parser/parser.ts` | 897 |

### Observations

- **Duplicate computation:** Batch and incremental both re-run `marketEngine` per fixture.
- **Cache opportunities:** Team profile API responses; per-fixture engine snapshot memoization.
- **Potential O(n²):** Statistics aggregation over growing observation lists.
- **Long functions:** `parser.ts` monolithic dispatch; `marketKnowledgeStatistics.ts` finalize blocks.

---

## Part 10 — Release Audit

### Blockers

1. **Consistency FAIL** — Batch ≠ Incremental checksum.
2. **Patterns FAIL** — 3 patterns unreachable on validation fixtures.
3. **Architecture gap** — Market engine stack not integrated into production recommendation path.

### Uncommitted Work

- `lib/systemValidation/*` staged but not in `d71c392` commit.
- `artifacts/system-validation-report.*` modified.

---

## Issues Summary

### Critical (2)

- **RC1-001** Batch/Replay vs Incremental checksum mismatch (`patternStatistics` league swap).
- **RC1-002** Market Engine not wired to production recommendation pipeline.

### High (5)

- **RC1-003** Three patterns never match validation fixtures.
- **RC1-004** Duplicate football-ai project at parent directory.
- **RC1-005** Dual learning/knowledge stacks with overlapping responsibility.
- **RC1-006** Dual replay namespaces (UI vs statistics).
- **RC1-007** `validate:system` overall FAIL.

### Medium (12)

Orphan types, duplicate interfaces, split components, unwired scripts, placeholders, monolithic parser/statistics modules, schema→replay coupling, uncommitted validation gate, learning persist warnings, isolated bettingHistory, ROI float drift.

### Low (9)

Oversized test scripts, repeated engine execution, LocalStorage not in default test, version skew, store/persistence overlap, scheduler cache gap, npm devdir warning, large validation runner, TrapLineRule placeholder metadata.

---

## Report Paths

| Artifact | Path |
|----------|------|
| Release audit (this file) | `artifacts/release-audit.md` |
| Release audit (JSON) | `artifacts/release-audit.json` |
| System validation | `artifacts/system-validation-report.md` |
| System validation (JSON) | `artifacts/system-validation-report.json` |
