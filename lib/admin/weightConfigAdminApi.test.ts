import { POST as postDraftRoute } from "@/app/api/admin/weight-config/drafts/route";
import {
  createWeightConfigAdminApiHandlers,
  mapActiveWeightConfigResponse,
  mapWeightConfigErrorToResponse,
  parseCreateWeightConfigDraftBody,
  WEIGHT_CONFIG_ADMIN_CREATED_BY,
  WeightConfigApiValidationError,
} from "@/lib/admin/weightConfigAdminApi";
import { DEFAULT_PROVIDER_WEIGHTS } from "@/lib/recommendation/providerWeights";
import { buildFallbackWeightConfig } from "@/lib/recommendation/weightConfigRuntime";
import {
  WeightConfigAlreadyActiveError,
  WeightConfigConflictError,
  WeightConfigNoActiveVersionError,
  WeightConfigNotFoundError,
  WeightConfigRollbackTargetNotFoundError,
} from "@/lib/supabase/services/weightConfigErrors";
import {
  resetRateLimitForTests,
  setRateLimitAdapterForTests,
} from "@/lib/security/rateLimiter";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const ADMIN_KEY = "weight-config-admin-api-test-key";
const VERSION_ID = "11111111-2222-4333-8444-555555555555";

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

function adminHeaders(): HeadersInit {
  return {
    "content-type": "application/json",
    "x-admin-key": ADMIN_KEY,
  };
}

function mockVersion(status: "draft" | "active" | "archived" = "draft") {
  return {
    id: VERSION_ID,
    version: 1,
    status,
    providerWeights: { ...DEFAULT_PROVIDER_WEIGHTS },
    marketBlendWeight: 0.6,
    sourceReportSnapshot: {},
    createdBy: WEIGHT_CONFIG_ADMIN_CREATED_BY,
    createdAt: "2026-07-18T00:00:00.000Z",
    appliedAt: status === "active" ? "2026-07-18T01:00:00.000Z" : null,
    archivedAt: status === "archived" ? "2026-07-18T02:00:00.000Z" : null,
  };
}

function validDraftBody() {
  return {
    providerWeights: { ...DEFAULT_PROVIDER_WEIGHTS },
    marketBlendWeight: 0.6,
    sourceReportSnapshot: { note: "test" },
  };
}

function setupEnv(): void {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:secret@localhost:5432/postgres";
  resetRateLimitForTests();
  setRateLimitAdapterForTests(new MemoryRateLimitAdapter());
}

async function testUnauthorized(): Promise<void> {
  setupEnv();
  const handlers = createWeightConfigAdminApiHandlers({
    createWeightConfigDraft: async () => mockVersion(),
    listWeightConfigVersions: async () => [],
    getActiveWeightConfig: async () => buildFallbackWeightConfig(),
    activateWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: null,
    }),
    rollbackWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: mockVersion("archived"),
    }),
  });

  const unauthorizedRequest = new Request(
    "http://localhost/api/admin/weight-config/drafts",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validDraftBody()),
    }
  );

  const draftResponse = await handlers.postDraft(unauthorizedRequest);
  assert(draftResponse.status === 401, "draft without auth returns 401");

  const versionsResponse = await handlers.getVersions(unauthorizedRequest);
  assert(versionsResponse.status === 401, "versions without auth returns 401");

  const activeResponse = await handlers.getActive(unauthorizedRequest);
  assert(activeResponse.status === 401, "active without auth returns 401");

  const activateResponse = await handlers.postActivate(unauthorizedRequest, VERSION_ID);
  assert(activateResponse.status === 401, "activate without auth returns 401");

  const rollbackResponse = await handlers.postRollback(unauthorizedRequest);
  assert(rollbackResponse.status === 401, "rollback without auth returns 401");
}

async function testDraftValidationFail(): Promise<void> {
  setupEnv();
  const handlers = createWeightConfigAdminApiHandlers({
    createWeightConfigDraft: async () => mockVersion(),
    listWeightConfigVersions: async () => [],
    getActiveWeightConfig: async () => buildFallbackWeightConfig(),
    activateWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: null,
    }),
    rollbackWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: mockVersion("archived"),
    }),
  });

  try {
    parseCreateWeightConfigDraftBody({
      marketBlendWeight: 0.6,
    });
    throw new Error("expected validation error");
  } catch (error) {
    assert(
      error instanceof WeightConfigApiValidationError,
      "missing providerWeights throws validation error"
    );
  }

  const invalidSumRequest = new Request(
    "http://localhost/api/admin/weight-config/drafts",
    {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        providerWeights: { ...DEFAULT_PROVIDER_WEIGHTS, recentForm: 0.99 },
        marketBlendWeight: 0.6,
      }),
    }
  );
  const response = await handlers.postDraft(invalidSumRequest);
  assert(response.status === 400, "invalid provider weight sum returns 400");
}

async function testDraftSuccess(): Promise<void> {
  setupEnv();
  let capturedCreatedBy = "";
  const handlers = createWeightConfigAdminApiHandlers({
    createWeightConfigDraft: async (input) => {
      capturedCreatedBy = input.createdBy;
      return mockVersion();
    },
    listWeightConfigVersions: async () => [],
    getActiveWeightConfig: async () => buildFallbackWeightConfig(),
    activateWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: null,
    }),
    rollbackWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: mockVersion("archived"),
    }),
  });

  const request = new Request("http://localhost/api/admin/weight-config/drafts", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      ...validDraftBody(),
      createdBy: "client-should-not-win",
      status: "active",
    }),
  });
  const response = await handlers.postDraft(request);
  assert(response.status === 400, "unknown fields like status are rejected");

  const validRequest = new Request("http://localhost/api/admin/weight-config/drafts", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(validDraftBody()),
  });
  const validResponse = await handlers.postDraft(validRequest);
  assert(validResponse.status === 200, "draft success returns 200");
  const body = (await validResponse.json()) as { ok?: boolean; version?: { id: string } };
  assert(body.ok === true, "draft success body ok");
  assert(body.version?.id === VERSION_ID, "draft success returns version");
  assert(capturedCreatedBy === WEIGHT_CONFIG_ADMIN_CREATED_BY, "createdBy is server-side");
}

async function testVersionsSuccess(): Promise<void> {
  setupEnv();
  const handlers = createWeightConfigAdminApiHandlers({
    createWeightConfigDraft: async () => mockVersion(),
    listWeightConfigVersions: async () => [mockVersion(), mockVersion("archived")],
    getActiveWeightConfig: async () => buildFallbackWeightConfig(),
    activateWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: null,
    }),
    rollbackWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: mockVersion("archived"),
    }),
  });

  const response = await handlers.getVersions(
    new Request("http://localhost/api/admin/weight-config/versions", {
      headers: adminHeaders(),
    })
  );
  assert(response.status === 200, "versions success returns 200");
  const body = (await response.json()) as { ok?: boolean; versions?: unknown[] };
  assert(body.ok === true, "versions body ok");
  assert(Array.isArray(body.versions) && body.versions.length === 2, "versions list returned");
}

async function testActiveFallback(): Promise<void> {
  setupEnv();
  const handlers = createWeightConfigAdminApiHandlers({
    createWeightConfigDraft: async () => mockVersion(),
    listWeightConfigVersions: async () => [],
    getActiveWeightConfig: async () => buildFallbackWeightConfig(),
    activateWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: null,
    }),
    rollbackWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: mockVersion("archived"),
    }),
  });

  const response = await handlers.getActive(
    new Request("http://localhost/api/admin/weight-config/active", {
      headers: adminHeaders(),
    })
  );
  assert(response.status === 200, "active fallback returns 200");
  const body = (await response.json()) as {
    active?: { source?: string; hasActiveVersion?: boolean; activeVersion?: unknown };
  };
  assert(body.active?.source === "fallback", "active source is fallback");
  assert(body.active?.hasActiveVersion === false, "hasActiveVersion false");
  assert(body.active?.activeVersion === null, "activeVersion null");

  const mapped = mapActiveWeightConfigResponse(buildFallbackWeightConfig());
  assert(mapped.source === "fallback", "mapper fallback source");
  assert(mapped.hasActiveVersion === false, "mapper hasActiveVersion false");
}

async function testActivateSuccess(): Promise<void> {
  setupEnv();
  const handlers = createWeightConfigAdminApiHandlers({
    createWeightConfigDraft: async () => mockVersion(),
    listWeightConfigVersions: async () => [],
    getActiveWeightConfig: async () => buildFallbackWeightConfig(),
    activateWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: null,
    }),
    rollbackWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: mockVersion("archived"),
    }),
  });

  const response = await handlers.postActivate(
    new Request("http://localhost/api/admin/weight-config/versions/id/activate", {
      method: "POST",
      headers: adminHeaders(),
    }),
    VERSION_ID
  );
  assert(response.status === 200, "activate success returns 200");
  const body = (await response.json()) as { ok?: boolean; activated?: { status?: string } };
  assert(body.ok === true, "activate body ok");
  assert(body.activated?.status === "active", "activate returns activated version");
}

async function testActivateNotFound(): Promise<void> {
  setupEnv();
  const handlers = createWeightConfigAdminApiHandlers({
    createWeightConfigDraft: async () => mockVersion(),
    listWeightConfigVersions: async () => [],
    getActiveWeightConfig: async () => buildFallbackWeightConfig(),
    activateWeightConfig: async () => {
      throw new WeightConfigNotFoundError(VERSION_ID);
    },
    rollbackWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: mockVersion("archived"),
    }),
  });

  const response = await handlers.postActivate(
    new Request("http://localhost/api/admin/weight-config/versions/id/activate", {
      method: "POST",
      headers: adminHeaders(),
    }),
    VERSION_ID
  );
  assert(response.status === 404, "activate not found returns 404");
  const body = (await response.json()) as { code?: string };
  assert(body.code === "WEIGHT_CONFIG_NOT_FOUND", "activate not found code");
}

async function testActivateConflict(): Promise<void> {
  setupEnv();
  const handlers = createWeightConfigAdminApiHandlers({
    createWeightConfigDraft: async () => mockVersion(),
    listWeightConfigVersions: async () => [],
    getActiveWeightConfig: async () => buildFallbackWeightConfig(),
    activateWeightConfig: async () => {
      throw new WeightConfigAlreadyActiveError(VERSION_ID);
    },
    rollbackWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: mockVersion("archived"),
    }),
  });

  const response = await handlers.postActivate(
    new Request("http://localhost/api/admin/weight-config/versions/id/activate", {
      method: "POST",
      headers: adminHeaders(),
    }),
    VERSION_ID
  );
  assert(response.status === 409, "activate conflict returns 409");
  const body = (await response.json()) as { code?: string };
  assert(body.code === "WEIGHT_CONFIG_ALREADY_ACTIVE", "activate conflict code");
}

async function testRollbackSuccess(): Promise<void> {
  setupEnv();
  const handlers = createWeightConfigAdminApiHandlers({
    createWeightConfigDraft: async () => mockVersion(),
    listWeightConfigVersions: async () => [],
    getActiveWeightConfig: async () => buildFallbackWeightConfig(),
    activateWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: null,
    }),
    rollbackWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: mockVersion("archived"),
    }),
  });

  const response = await handlers.postRollback(
    new Request("http://localhost/api/admin/weight-config/rollback", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({}),
    })
  );
  assert(response.status === 200, "rollback success returns 200");
}

async function testRollbackNoActive(): Promise<void> {
  setupEnv();
  const handlers = createWeightConfigAdminApiHandlers({
    createWeightConfigDraft: async () => mockVersion(),
    listWeightConfigVersions: async () => [],
    getActiveWeightConfig: async () => buildFallbackWeightConfig(),
    activateWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: null,
    }),
    rollbackWeightConfig: async () => {
      throw new WeightConfigNoActiveVersionError();
    },
  });

  const response = await handlers.postRollback(
    new Request("http://localhost/api/admin/weight-config/rollback", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({}),
    })
  );
  assert(response.status === 409, "rollback no active returns 409");
  const body = (await response.json()) as { code?: string };
  assert(body.code === "WEIGHT_CONFIG_NO_ACTIVE", "rollback no active code");
}

async function testRollbackTargetNotFound(): Promise<void> {
  setupEnv();
  const handlers = createWeightConfigAdminApiHandlers({
    createWeightConfigDraft: async () => mockVersion(),
    listWeightConfigVersions: async () => [],
    getActiveWeightConfig: async () => buildFallbackWeightConfig(),
    activateWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: null,
    }),
    rollbackWeightConfig: async () => {
      throw new WeightConfigRollbackTargetNotFoundError(VERSION_ID);
    },
  });

  const response = await handlers.postRollback(
    new Request("http://localhost/api/admin/weight-config/rollback", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ targetVersionId: VERSION_ID }),
    })
  );
  assert(response.status === 404, "rollback target not found returns 404");
}

async function testInternalErrorDoesNotLeakStack(): Promise<void> {
  setupEnv();
  const secret = "postgresql://postgres:super-secret@db.example.com:5432/postgres";
  const handlers = createWeightConfigAdminApiHandlers({
    createWeightConfigDraft: async () => {
      const error = new Error(`${secret} at sensitive.ts:99:13`);
      throw error;
    },
    listWeightConfigVersions: async () => [],
    getActiveWeightConfig: async () => buildFallbackWeightConfig(),
    activateWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: null,
    }),
    rollbackWeightConfig: async () => ({
      activated: mockVersion("active"),
      previousActive: mockVersion("archived"),
    }),
  });

  const response = await handlers.postDraft(
    new Request("http://localhost/api/admin/weight-config/drafts", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify(validDraftBody()),
    })
  );
  assert(response.status === 500, "internal error returns 500");
  const text = await response.text();
  assert(!text.includes("super-secret"), "response must not leak password");
  assert(!text.includes("sensitive.ts"), "response must not leak stack path");
  assert(!text.includes("at "), "response must not leak stack trace");

  const conflictResponse = mapWeightConfigErrorToResponse(
    new WeightConfigConflictError("23505", secret)
  );
  const conflictBody = (await conflictResponse.json()) as {
    postgresCode?: string;
    message?: string;
  };
  assert(conflictResponse.status === 409, "conflict maps to 409");
  assert(conflictBody.postgresCode === "23505", "conflict preserves postgres code");
  assert(!JSON.stringify(conflictBody).includes("super-secret"), "conflict body sanitized");
}

async function testRouteExportsUseNodeRuntime(): Promise<void> {
  const draftModule = await import("@/app/api/admin/weight-config/drafts/route");
  const activateModule = await import("@/app/api/admin/weight-config/versions/[id]/activate/route");
  assert(draftModule.runtime === "nodejs", "draft route uses nodejs runtime");
  assert(activateModule.runtime === "nodejs", "activate route uses nodejs runtime");
}

async function testRouteUnauthorizedEntryPoint(): Promise<void> {
  setupEnv();
  const response = await postDraftRoute(
    new Request("http://localhost/api/admin/weight-config/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validDraftBody()),
    })
  );
  assert(response.status === 401, "route entry unauthorized returns 401");
}

export async function runWeightConfigAdminApiTests(): Promise<void> {
  await testUnauthorized();
  await testDraftValidationFail();
  await testDraftSuccess();
  await testVersionsSuccess();
  await testActiveFallback();
  await testActivateSuccess();
  await testActivateNotFound();
  await testActivateConflict();
  await testRollbackSuccess();
  await testRollbackNoActive();
  await testRollbackTargetNotFound();
  await testInternalErrorDoesNotLeakStack();
  await testRouteExportsUseNodeRuntime();
  await testRouteUnauthorizedEntryPoint();
}

runWeightConfigAdminApiTests()
  .then(() => {
    console.log("Weight config admin API tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
