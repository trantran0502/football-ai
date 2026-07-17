# Production Supabase Verification v1
Generated: 2026-07-17T10:27:34.279Z
## Overall: PASS
| Check | Status |
|-------|--------|
| Production Deployment | PASS |
| Environment Variables | NOT TESTABLE |
| Authenticated Health Route | PASS |
| Production Insert | PASS |
| Production Select | PASS |
| Production Update | PASS |
| Production Delete | PASS |
| Cleanup | PASS |
Local Supabase host: qjzuledpatlbjsymqtbb.supabase.co
Production Supabase host: qjzuledpatlbjsymqtbb.supabase.co
Same project: yes
healthCheckId: production-health-2026-07-17T10-27-27-512Z
- Vercel Production env vars cannot be read from this environment — verify manually in Vercel Dashboard.
- Required on Production: SUPABASE_URL (server), SUPABASE_SERVICE_ROLE_KEY, ADMIN_API_KEY (matching local).
- Note: this project uses SUPABASE_URL server-side, not NEXT_PUBLIC_SUPABASE_* browser clients.