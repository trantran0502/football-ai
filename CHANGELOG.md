# Changelog

All notable changes to Football AI are documented in this file.

## [1.0.0] — 2026-07-17

First stable release. Football AI v1.0 delivers a verified end-to-end pipeline for football match analysis, recommendation, market intelligence, and learning.

### Parser

- Multi-market odds parser supporting Asian Handicap (AH), Over/Under (OU), BTTS, and Moneyline (1X2).
- Water-level, half-win/half-loss, push, and handicap line normalization.
- Partial-market and special-parser validation gates (`validate-special-parsers.ts`, `test-partial-markets.ts`).
- Primary implementation: `lib/parser/parser.ts`.

### Recommendation Engine

- Feature-fusion pipeline combining league strength, squad availability, match context, H2H, recent form, goals/xG, and market odds.
- Production provider weighting by availability and confidence.
- Candidate generation, scoring, confidence bounds, and structured reason output.
- Market Engine score blending integrated into live recommendation decisions (`marketEngineIntegration.ts`).
- Admin dashboards for recommendation validation and learning diagnostics.

### Validation Engine

- Production validation pipeline for recommendation records and market outcomes.
- Recommendation Validation Dashboard with shared provider diagnostics.
- Learning record repair and backfill from verified `match_records`.
- Fixture metadata persistence on daily-analysis saves.

### Replay Engine

- Match-level historical replay for UI and trace (`lib/replay/`).
- Market Knowledge replay engine for batch-equivalent snapshot reconstruction (`lib/replay/marketKnowledge/`).
- Unified replay namespace with backward-compatible re-exports from `marketKnowledge/replay/`.
- Replay reports, step tracing, and checksum validation.

### Batch Learning

- Recommendation Learning accumulates provider performance after VERIFIED matches.
- Market Knowledge batch builder from verified match observations via rules and patterns.
- Batch statistics aggregation with league hit rates, ROI, and pattern/rule buckets.
- Self-running learning pipeline on admin deploy with automatic backfill.

### Incremental Learning

- Incremental market knowledge updates with replay-consistent statistics.
- Incremental validator and report generation.
- Batch / replay / incremental checksum consistency (epsilon-stabilized comparison).
- Pattern statistics round-trip preservation (`leagueHitRates`, `hitCount`, `totalProfit`, `totalStake`).

### Market Engine

- Market AI Engine V1 with AH, OU, BTTS, and 1X2 analyzers.
- Market audit, score breakdown, and risk assessment.
- Market history provider scaffold.
- 492 automated validation checks; integrated into production recommendation path.

### Rule Engine

- Market Rule Engine with registry, audit log, and score integration.
- Rules: BalancedMarket, HighOverroundRisk, HomeLowWaterFavorite, AwayHighWaterValue, and related market rules.
- Placeholder rules (SteamMove, SharpMoney, TrapLine) registered but intentionally inert in v1.0.
- 71 rule validation checks.

### Pattern Engine

- Market Pattern Engine with registry, definitions, audit, and score integration.
- Ten pattern definitions including HomeLowWaterBalanced, BalancedUnderdog, LowOverroundBalanced, AwayHighWaterValue, and others.
- Canonical pattern coverage contexts for system validation fixtures.
- 620 pattern validation checks.

### Knowledge Engine

- Market Knowledge Base V1: types, builder, store, queries, snapshot, and accumulator.
- Knowledge layer boundaries documented (`lib/knowledgeLayers/`):
  - `lib/knowledge` — static market interpretation
  - `lib/learning` — recommendation learning
  - `lib/recommendation/marketKnowledge` — verified market-engine statistics
- Verified-pipeline ingestion from VERIFIED matches only.

### Persistence

- Market Knowledge Persistence V1 with versioned snapshot storage.
- File and in-memory repository implementations.
- Integrity checks, manifest, checksum, and recovery validation.
- Supabase match record storage with unified `MatchRecordVerifyResult` type.
- LocalStorage persistence for client-side state (standalone test script).

### Weight Optimizer

- Weight Optimizer analysis mode for admin review of provider and feature weights.
- Admin UI at `/admin/weight-optimizer`.
- Diagnostics integration with recommendation learning pipeline.

### System Validation

- Full system validation runner (`npm run validate:system`) covering build, unit tests, market engine, rules, patterns, knowledge batch, replay, persistence, incremental, consistency, market engine integration, and verified pipeline.
- 12 canonical fixtures; all sections PASS at v1.0.0.
- JSON and Markdown report artifacts under `artifacts/`.

---

[1.0.0]: https://github.com/trantran0502/football-ai/releases/tag/v1.0.0
