# Scheduler Odds Runbook

Phase 2-A — Real Scheduler Odds Integration (COMPLETED / SEALED)

This document covers production operation of real odds resolution in the daily scheduler. It does not modify Parser, Recommendation, Learning, Replay, Browser, Weight Config, Admin, or DB schema.

---

## Architecture

```
SchedulerFixtureSource
  → OddsQuery (fixtureId only)
  → SchedulerOddsResolver
  → OddsProvider (factory)
  → ApiFootballOddsAdapter | MockOddsAdapter
  → OddsData[]
  → SchedulerRawOddsFormatter
  → rawOdds
  → ProductionFixture
  → dailyMatchPipeline → analyzeMatch()
```

Entry point: `resolveSchedulerFixturesToProduction()` in `lib/scheduler/schedulerOddsIntegration.ts`, called from `dailyScheduler.ts` after league filter and before queue merge.

Provider routing (`lib/scheduler/schedulerOddsConfig.ts`):

| Condition | Provider |
|-----------|----------|
| `USE_REAL_SCHEDULER_ODDS=false` | placeholder |
| `USE_REAL_SCHEDULER_ODDS=true` + `SCHEDULER_ODDS_SOURCE=mock` | MockOddsAdapter |
| `USE_REAL_SCHEDULER_ODDS=true` + `SCHEDULER_ODDS_SOURCE=api-football` | ApiFootballOddsAdapter |
| Unknown source | placeholder (never throws) |

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_REAL_SCHEDULER_ODDS` | `false` | Master switch for real odds. `false` = placeholder only. |
| `SCHEDULER_ODDS_SOURCE` | — | `mock` or `api-football` when real odds enabled. |
| `SCHEDULER_ODDS_BOOKMAKER_ID` | — | Optional preferred bookmaker (e.g. `8` for Bet365). |
| `API_FOOTBALL_KEY` | — | Required for `api-football` source (server-only). |

See `.env.example` for full scheduler and API-Football settings.

**Never commit real API keys.**

---

## Production enable

1. Set environment variables (Vercel / `.env.local`):

   ```
   USE_REAL_SCHEDULER_ODDS=true
   SCHEDULER_ODDS_SOURCE=api-football
   ```

2. Optional bookmaker preference:

   ```
   SCHEDULER_ODDS_BOOKMAKER_ID=8
   ```

3. Ensure `API_FOOTBALL_KEY` is configured server-side.

4. Redeploy or restart only if your platform requires env reload; rollback does not require redeploy.

---

## Rollback

Set:

```
USE_REAL_SCHEDULER_ODDS=false
```

All fixtures receive placeholder odds immediately. `SCHEDULER_ODDS_SOURCE` is ignored when the flag is off.

- No rebuild required
- No DB migration required
- No redeploy required on platforms that hot-reload env

---

## Expected execution log

Daily scheduler records `schedulerOdds` in execution log context:

```json
{
  "source": "placeholder | mock | api-football",
  "total": 3,
  "resolved": 2,
  "fallback": 1,
  "providerErrors": 1
}
```

- `total` — fixtures processed in odds resolution batch
- `resolved` — fixtures with real formatted odds
- `fallback` — fixtures that used placeholder
- `providerErrors` — provider/quota/format failures counted per fixture

**Do not log:** API keys, full odds text, `marketSelections`, or bookmaker response payloads.

---

## Quota behavior

In-process gate (`lib/providers/apiFootball/apiFootballQuota.ts`):

- Daily limit: 100 requests
- Minute limit: 10 requests

When quota is exceeded during a scheduler run:

1. Current and remaining fixtures fallback to placeholder
2. `providerBlocked` is set for the rest of the batch
3. Scheduler and batch continue — never aborted

Date scheduler respects the same daily budget as other API-Football calls.

---

## Provider failure behavior

Per-fixture isolation. These affect **one fixture only** (fallback to placeholder):

- API timeout, 429, network errors
- Quota exhaustion
- Empty odds / mapping failure
- Bookmaker selection failure
- Formatter returning null

The scheduler run and remaining fixtures are **not** stopped.

---

## Live probe

Verify API-Football odds adapter against live API:

```bash
npm run test:api-football-odds:live
```

Optional date override:

```
API_FOOTBALL_ODDS_PROBE_DATE=2026-07-18
```

Failures due to quota, plan limits, or missing coverage are **environment/API limits**, not necessarily code defects.

---

## Production proof

End-to-end proof: Scheduler resolver → ApiFootballOddsAdapter → Formatter → `analyzeMatch()`:

```bash
npm run test:scheduler-odds:production-proof
```

Optional date override:

```
SCHEDULER_ODDS_PRODUCTION_PROOF_DATE=2026-07-18
```

Sealed proof result (2026-07-18):

| Field | Value |
|-------|-------|
| fixtureId | 1490329 |
| source | api-football |
| resolved | 1 |
| fallback | 0 |
| providerErrors | 0 |
| isPlaceholder | false |
| analyzeMatchPassed | true |

---

## Troubleshooting

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| All `fallback`, `source=api-football` | Quota exhausted | Wait for minute/daily reset; check `canMakeApiFootballRequest` |
| `providerErrors` high, partial `resolved` | Coverage gaps or mapping limits | Expected on free plan; check live probe fixture count |
| Rollback not taking effect | Env not reloaded | Set `USE_REAL_SCHEDULER_ODDS=false`; restart process if needed |
| Live probe 429 | Rate limit | Non-program error; retry after 1 minute |
| Production proof `NO_RESOLVED_FIXTURE` | No odds for date or quota | Try `SCHEDULER_ODDS_PRODUCTION_PROOF_DATE`; verify API plan |
| `analyzeMatchPassed: false` | Formatter/parser mismatch | Check mapped markets in `apiFootballOdds.test.ts` |

---

## Security and logging

- Store `API_FOOTBALL_KEY` server-only (never `NEXT_PUBLIC_*`)
- Do not paste API keys into execution logs, support tickets, or runbook updates
- Do not log raw API responses or full `rawOdds` in production observability

---

## Related files

| File | Role |
|------|------|
| `lib/scheduler/schedulerOddsConfig.ts` | Feature flags |
| `lib/scheduler/schedulerOddsProvider.ts` | Provider factory |
| `lib/scheduler/schedulerOddsResolver.ts` | Resolve + fallback |
| `lib/scheduler/schedulerOddsIntegration.ts` | Batch + quota gate |
| `lib/providers/odds/apiFootballOddsAdapter.ts` | API-Football adapter |
| `lib/scheduler/schedulerRawOddsFormatter.ts` | OddsData → rawOdds |
| `PROJECT_MASTER.md` | Milestone seal record |
