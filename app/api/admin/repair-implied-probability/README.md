# Repair Implied Probability API (PR2.3)

One-time admin endpoint to fix legacy `impliedProbability > 1` values in Supabase `match_records`.

Runs on Vercel Serverless with `SUPABASE_SERVICE_ROLE_KEY` (server-only).

## Environment

Add to `.env.local` (local) and Vercel Project Settings (production):

```env
ADMIN_REPAIR_KEY=your-secret-admin-key
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

## Endpoint

```
POST /api/admin/repair-implied-probability
Header: x-admin-key: <ADMIN_REPAIR_KEY>
Content-Type: application/json
```

### Dry run

Reports polluted records without writing.

```bash
curl -X POST "https://football-ai-ten.vercel.app/api/admin/repair-implied-probability" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_REPAIR_KEY" \
  -d "{\"dryRun\":true}"
```

Response:

```json
{
  "ok": true,
  "dryRun": true,
  "recordsToRepair": [
    {
      "recordId": "...",
      "homeTeam": "...",
      "awayTeam": "...",
      "changeCount": 10,
      "changes": [
        {
          "fieldPath": "marketSelections[3].impliedProbability",
          "oldValue": 1.1111111111111112,
          "newValue": 0.5263157894736842
        }
      ]
    }
  ],
  "pollutedRecordCount": 4,
  "pollutedFieldCount": 34
}
```

### Apply

Patches only `market_selections`, `analysis_snapshot`, and `updated_at`.

```bash
curl -X POST "https://football-ai-ten.vercel.app/api/admin/repair-implied-probability" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_REPAIR_KEY" \
  -d "{\"dryRun\":false}"
```

Response:

```json
{
  "ok": true,
  "dryRun": false,
  "success": 4,
  "failed": 0,
  "updatedRecordIds": ["..."],
  "pollutedRecordCountBefore": 4,
  "pollutedRecordCountAfter": 0
}
```

### Unauthorized

Wrong or missing `x-admin-key` returns HTTP 401.

```bash
curl -X POST "https://football-ai-ten.vercel.app/api/admin/repair-implied-probability" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: wrong-key" \
  -d "{\"dryRun\":true}"
```

## Local dev

```bash
npm run dev
```

```bash
curl -X POST "http://localhost:3000/api/admin/repair-implied-probability" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_REPAIR_KEY" \
  -d "{\"dryRun\":true}"
```

## Test script

```bash
npm run test:repair-api
```

Optional flags:

```bash
npm run test:repair-api -- --api=http://localhost:3000
npm run test:repair-api -- --skip-apply
```
