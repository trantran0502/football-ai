# API-Football Health Report

**Completed:** 2026-07-17T14:56:30.178Z
**Duration:** 4492ms
**Overall:** FAIL

## Configuration

| Field | Value |
|-------|-------|
| Environment variable | `API_FOOTBALL_KEY` |
| Optional base URL variable | `API_FOOTBALL_BASE_URL` |
| Base URL | https://v3.football.api-sports.io |
| Key configured locally | yes |
| Provider quota limit header | 100 |
| Provider quota remaining header | 99 |
| Local daily quota | 0/100 |
| Local minute quota | 0/10 |

## Checks

| Section | Check | Status | Evidence |
|---------|-------|--------|----------|
| Environment | API_FOOTBALL_KEY configured | PASS | present (value redacted) |
| Security | Secret exposure | PASS | API_FOOTBALL_KEY is server-only; no NEXT_PUBLIC_API_FOOTBALL_* found |
| Raw endpoint | GET /timezone | FAIL | provider errors present: access: Your account is suspended, check on https://dashboard.api-football.com. |
| Provider | Team lookup | FAIL | API-Football error: {"access":"Your account is suspended, check on https://dashboard.api-football.com."} |
| Provider | Fixture lookup | FAIL | API-Football error: {"access":"Your account is suspended, check on https://dashboard.api-football.com."} |
| Quota | Provider rate-limit headers | PASS | limit=100 remaining=99 |
| Security | Invalid key handling | PASS | invalid key rejected with HTTP 403 |
| Quota | Local quota block | PASS | daily_limit |
| Provider | Recent form | NOT TESTABLE | team id unavailable |
| Cache | Write and read | PASS | teamId=42 |
| Provider | Missing-data behavior | PASS | unconfigured client returns null bundle |

## Root Causes

- provider errors present: access: Your account is suspended, check on https://dashboard.api-football.com.
- API-Football error: {"access":"Your account is suspended, check on https://dashboard.api-football.com."}
- API-Football error: {"access":"Your account is suspended, check on https://dashboard.api-football.com."}

## Production

- Set `API_FOOTBALL_KEY` on Vercel Production (server-only, not `NEXT_PUBLIC_*`).
- Run `npm run health:api-football:production` after deploy.
