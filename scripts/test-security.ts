import { GET as healthGet } from "@/app/api/data/health/route";
import { GET as matchRecordsGet, POST as matchRecordsPost } from "@/app/api/data/match-records/route";
import { POST as importPost } from "@/app/api/data/import/route";
import { GET as replayGet } from "@/app/api/replay/[matchId]/route";
import { POST as cronDailySummaryPost, GET as cronDailySummaryGet } from "@/app/api/admin/cron/daily-summary/route";
import { POST as teamDataPost } from "@/app/api/football/team-data/route";
import { verifyAdminApiKey, verifyCronSecret } from "@/lib/security";
import {
  resetRateLimitForTests,
  setRateLimitAdapterForTests,
} from "@/lib/security/rateLimiter";
import { securityHeaders } from "@/next.config";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const ADMIN_KEY = "rc2-test-admin-key";
const CRON_SECRET = "rc2-test-cron-secret";

function adminHeaders(): HeadersInit {
  return { "x-admin-key": ADMIN_KEY };
}

function cronHeaders(): HeadersInit {
  return { Authorization: `Bearer ${CRON_SECRET}` };
}

class MemoryRateLimitAdapter {
  private buckets = new Map<string, { count: number; windowStartedAt: number }>();

  async checkAndIncrement(
    bucketKey: string,
    config: { windowMs: number; maxRequests: number }
  ): Promise<"allow" | "deny"> {
    const now = Date.now();
    const existing = this.buckets.get(bucketKey);
    if (!existing || now - existing.windowStartedAt >= config.windowMs) {
      this.buckets.set(bucketKey, { count: 1, windowStartedAt: now });
      return "allow";
    }
    if (existing.count >= config.maxRequests) {
      return "deny";
    }
    existing.count += 1;
    this.buckets.set(bucketKey, existing);
    return "allow";
  }
}

async function runTests(): Promise<void> {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.SCHEDULER_ENABLED = "true";
  process.env.RATE_LIMIT_ADAPTER = "memory";
  process.env.ADMIN_DASHBOARD_REQUIRE_AUTH = "true";
  resetRateLimitForTests();
  setRateLimitAdapterForTests(new MemoryRateLimitAdapter());

  const noKeyRequest = new Request("http://localhost/api/data/match-records");
  const noKeyResponse = await matchRecordsGet(noKeyRequest);
  assert(noKeyResponse.status === 401, "missing admin key should return 401");
  const noKeyBody = (await noKeyResponse.json()) as { message?: string };
  assert(noKeyBody.message === "Unauthorized.", "401 body should be generic");

  const wrongKeyRequest = new Request("http://localhost/api/data/match-records", {
    headers: { "x-admin-key": "wrong-key" },
  });
  const wrongKeyResponse = await matchRecordsGet(wrongKeyRequest);
  assert(wrongKeyResponse.status === 401, "wrong admin key should return 401");

  const adminRequest = new Request("http://localhost/api/data/match-records", {
    headers: adminHeaders(),
  });
  const adminResponse = await matchRecordsGet(adminRequest);
  assert(adminResponse.status === 503 || adminResponse.status === 200, "valid admin key should pass auth");

  const publicHealth = await healthGet(new Request("http://localhost/api/data/health"));
  const publicHealthBody = (await publicHealth.json()) as Record<string, unknown>;
  assert(publicHealthBody.ok === true, "public health should return ok true");
  assert(!("supabase" in publicHealthBody), "public health must not expose supabase details");

  const adminHealth = await healthGet(
    new Request("http://localhost/api/data/health", { headers: adminHeaders() })
  );
  const adminHealthBody = (await adminHealth.json()) as Record<string, unknown>;
  assert("supabase" in adminHealthBody, "admin health should include supabase details");

  const replayUnauthorized = await replayGet(
    new Request("http://localhost/api/replay/test-id"),
    { params: Promise.resolve({ matchId: "test-id" }) }
  );
  assert(replayUnauthorized.status === 401, "replay without auth should be 401");

  const writeUnauthorized = await matchRecordsPost(
    new Request("http://localhost/api/data/match-records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawOdds: "x", report: { match: { homeTeam: "A", awayTeam: "B" } } }),
    })
  );
  assert(writeUnauthorized.status === 401, "data write without auth should be 401");

  const importUnauthorized = await importPost(
    new Request("http://localhost/api/data/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1 }),
    })
  );
  assert(importUnauthorized.status === 401, "import without auth should be 401");

  const oversizedImport = await importPost(
    new Request("http://localhost/api/data/import", {
      method: "POST",
      headers: {
        ...adminHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ blob: "x".repeat(6_000_000) }),
    })
  );
  assert(oversizedImport.status === 400, "oversized import body should be rejected");

  assert(
    verifyCronSecret(
      new Request("http://localhost/api/admin/cron/daily-summary", {
        headers: cronHeaders(),
      })
    ),
    "valid cron secret should pass"
  );
  assert(
    !verifyCronSecret(
      new Request("http://localhost/api/admin/cron/daily-summary", {
        headers: { Authorization: "Bearer wrong" },
      })
    ),
    "invalid cron secret should fail"
  );

  const cronUnauthorized = await cronDailySummaryPost(
    new Request("http://localhost/api/admin/cron/daily-summary", {
      method: "POST",
      headers: adminHeaders(),
      body: "{}",
    })
  );
  assert(cronUnauthorized.status === 401, "cron route must not accept admin key alone");

  const cronAuthorized = await cronDailySummaryPost(
    new Request("http://localhost/api/admin/cron/daily-summary", {
      method: "POST",
      headers: {
        ...cronHeaders(),
        "Content-Type": "application/json",
      },
      body: "{}",
    })
  );
  assert(cronAuthorized.status === 503 || cronAuthorized.status === 200, "cron secret should pass auth gate");

  const cronGetAuthorized = await cronDailySummaryGet(
    new Request("http://localhost/api/admin/cron/daily-summary", {
      method: "GET",
      headers: cronHeaders(),
    })
  );
  assert(
    cronGetAuthorized.status === 503 || cronGetAuthorized.status === 200,
    "cron GET with secret should pass auth gate"
  );

  process.env.SCHEDULER_ENABLED = "false";
  const cronDisabled = await cronDailySummaryPost(
    new Request("http://localhost/api/admin/cron/daily-summary", {
      method: "POST",
      headers: {
        ...cronHeaders(),
        "Content-Type": "application/json",
      },
      body: "{}",
    })
  );
  assert(cronDisabled.status === 503, "disabled scheduler should return 503");
  process.env.SCHEDULER_ENABLED = "true";

  const limitedIp = "203.0.113.10";
  for (let index = 0; index < 10; index += 1) {
    const response = await teamDataPost(
      new Request("http://localhost/api/football/team-data", {
        method: "POST",
        headers: {
          ...adminHeaders(),
          "Content-Type": "application/json",
          "x-forwarded-for": limitedIp,
        },
        body: JSON.stringify({ homeTeam: "Arsenal", awayTeam: "Chelsea" }),
      })
    );
    assert(response.status !== 429, `request ${index + 1} should not be rate limited yet`);
  }

  const rateLimited = await teamDataPost(
    new Request("http://localhost/api/football/team-data", {
      method: "POST",
      headers: {
        ...adminHeaders(),
        "Content-Type": "application/json",
        "x-forwarded-for": limitedIp,
      },
      body: JSON.stringify({ homeTeam: "Arsenal", awayTeam: "Chelsea" }),
    })
  );
  assert(rateLimited.status === 429, "rate limit should return 429");

  const headerKeys = securityHeaders.map((item) => item.key);
  assert(headerKeys.includes("Content-Security-Policy"), "security headers should include CSP");
  assert(headerKeys.includes("X-Content-Type-Options"), "security headers should include nosniff");
  assert(headerKeys.includes("X-Frame-Options"), "security headers should include frame protection");

  assert(
    verifyAdminApiKey(
      new Request("http://localhost", {
        headers: adminHeaders(),
      })
    ),
    "admin key verifier should accept configured key"
  );

  const nextStaticDir = path.join(process.cwd(), ".next", "static");
  if (existsSync(nextStaticDir)) {
    const forbiddenPatterns = [
      ADMIN_KEY,
      "SUPABASE_SERVICE_ROLE_KEY",
      "ADMIN_API_KEY",
      "sb_secret_",
    ];
    const stack: string[] = [nextStaticDir];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const entry of require("node:fs").readdirSync(current, { withFileTypes: true })) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        if (!entry.name.endsWith(".js") && !entry.name.endsWith(".json")) {
          continue;
        }
        const contents = readFileSync(fullPath, "utf8");
        for (const pattern of forbiddenPatterns) {
          assert(!contents.includes(pattern), `client bundle must not contain ${pattern}`);
        }
      }
    }
  }

  console.log("All security tests passed.");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
