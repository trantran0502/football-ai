# Production API-Football Verification

**Completed:** 2026-07-17T15:15:04.377Z
**Overall:** PASS
**Production URL:** https://football-ai-ten.vercel.app

## Gates

| Gate | Status |
|------|--------|
| Production deployment | PASS |
| Environment variables | NOT TESTABLE |
| Authenticated health route | PASS |
| Provider raw endpoint | PASS |
| Provider team lookup | PASS |
| Provider fixture lookup | PASS |

## Probe Summary

| Field | Value |
|-------|-------|
| healthCheckId | production-api-football-2026-07-17T15-15-00-924Z |
| keyConfigured (server) | yes |
| baseUrl | https://v3.football.api-sports.io |
| httpStatus | 200 |
| schemaValid | yes |
| rawEndpointStatus | PASS |
| teamLookupStatus | PASS |
| fixtureLookupStatus | PASS |
| quota limit header | 100 |
| quota remaining header | 99 |
| teamId | 42 |
| teamName | Arsenal |
| fixtureCount | 57 |
| latencyMs | 1075 |
| passed | yes |


## Diagnostics

### Raw Endpoint

| Field | Value |
|-------|-------|
| Endpoint | /timezone |
| HTTP status | 200 |
| Outcome | PASS |
| Top-level keys | get, parameters, errors, results, paging, response |
| Provider errors | - |
| Results count | 427 |
| Response length | 427 |
| Envelope valid | yes |
| Schema validation | valid API-Football v3 envelope |
| Query parameters | - |
| Gate reason | HTTP 200 with valid API-Football envelope and no provider errors |

### Team Lookup

| Field | Value |
|-------|-------|
| Endpoint | /teams |
| HTTP status | 200 |
| Outcome | PASS |
| Top-level keys | get, parameters, errors, results, paging, response |
| Provider errors | - |
| Results count | 1 |
| Response length | 1 |
| Envelope valid | yes |
| Schema validation | team id and name returned via ApiFootballClient.getTeamById |
| Query parameters | {"id":42} |
| Gate reason | team=Arsenal id=42 |

### Fixture Lookup

| Field | Value |
|-------|-------|
| Endpoint | /fixtures |
| HTTP status | 200 |
| Outcome | PASS |
| Top-level keys | get, parameters, errors, results, paging, response |
| Provider errors | - |
| Results count | 57 |
| Response length | 57 |
| Envelope valid | yes |
| Schema validation | fixture id, teams and goals mapped via ApiFootballClient.getFixturesByTeamSeason |
| Query parameters | {"team":42,"season":2023} |
| Gate reason | season=2023 count=57 |

## Manual Steps

- Verify Vercel Production has server-only API_FOOTBALL_KEY configured (not NEXT_PUBLIC_*).
- Optional: API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io if using the default api-sports endpoint.
- Vercel Production env vars cannot be read from this environment — confirm API_FOOTBALL_KEY in Vercel Dashboard.
