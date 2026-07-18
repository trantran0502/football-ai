# Replay Data Source Policy

## Purpose

This policy defines which match records may be used as Decision V3 replay evidence and how Historical Backfill interacts with Daily Analysis.

## Formal Replay Dataset Source

The **formal replay-eligible dataset** must come from:

- **Daily Analysis Scheduler**
- **Pre-match captured data**
- Complete analysis payload at save time:
  - non-empty `raw_odds`
  - at least one settleable `market_selections` entry
  - non-null `analysis_snapshot`

Replay eligibility rules remain unchanged. This policy governs **data origin and completeness**, not replay scoring logic.

## Historical Backfill Role

Historical Backfill exists to populate:

- fixture identity (`fixture_id`, teams, league metadata)
- final match result
- verified status for result/statistics workflows

Historical Backfill **does not**:

- fetch odds
- call `resolveSchedulerRawOdds()`
- call `analyzeMatch()`
- create replay evidence

Backfill records are stored with:

- `source = historical_backfill`
- empty `raw_odds`
- empty `market_selections`
- null `analysis_snapshot`

These records are valid for fixture/result statistics, but **must not be treated as replay evidence by themselves**.

## Daily Analysis Enrichment

When Daily Analysis later processes the same fixture, the Data Completeness Guard may **upgrade** an incomplete backfill row instead of skipping it as a duplicate.

Enrichment is allowed only when the existing row is an incomplete backfill record:

- `source = historical_backfill`
- empty `raw_odds`
- empty `market_selections`
- null `analysis_snapshot`

Enrichment updates analysis fields in place and records metadata in `analysis_snapshot.dataCompleteness`:

- `analysisEnriched: true`
- `analysisEnrichedAt`
- `enrichedFrom: "historical_backfill"`

Enrichment preserves:

- existing `result`
- existing `status` (including `VERIFIED`)
- existing `verification_result`
- existing `created_at`
- existing `fixture_id`
- match date identity

Enrichment does **not** create a second row.

## Explicit Non-Goals

This phase does **not**:

- backfill historical odds for existing rows
- use post-match odds as replay input
- modify replay eligibility rules
- modify Decision V3, settlement, parser, or weights

Reason:

- post-match odds may leak future information
- API historical odds availability is not guaranteed
- replay input must represent pre-match captured analysis only

## Existing Production Data

The current production dataset may contain VERIFIED backfill rows without analysis fields. Those rows remain unchanged in this phase.

Future Daily Analysis runs may enrich matching fixtures going forward, but no batch historical odds rewrite is performed.

## Observability

Daily Analysis execution logs expose read-only Data Completeness stats:

- `inserted`
- `duplicateSkipped`
- `historicalBackfillEnriched`
- `incompleteAnalysisRejected`
- `conflictingRecords`
- `oddsMissing`
- `settleableMarketMissing`
- `analysisSnapshotMissing`

Logs must not include full raw odds payloads.

## Summary

| Source | Fixture/Result | Replay Evidence |
|--------|----------------|-----------------|
| Historical Backfill alone | Yes | No |
| Daily Analysis insert | Yes | Yes (subject to replay eligibility) |
| Daily Analysis enrichment of backfill row | Yes | Yes (subject to replay eligibility) |
