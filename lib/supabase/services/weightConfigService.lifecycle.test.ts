import { DEFAULT_PROVIDER_WEIGHTS } from "@/lib/recommendation/providerWeights";
import {
  loadRuntimeWeightConfigForProduction,
  resetRuntimeWeightConfigCacheForTests,
} from "@/lib/recommendation/runtimeWeightConfigLoader";
import type { RuntimeWeightConfig } from "@/lib/recommendation/weightConfigTypes";
import {
  activateWeightConfig,
  rollbackWeightConfig,
} from "@/lib/supabase/services/weightConfigService";
import {
  InMemoryWeightConfigTransactionStore,
} from "@/lib/supabase/services/weightConfigTransactionStore";
import type { WeightConfigVersionRow } from "@/lib/supabase/database.types";
import { buildExecutionLogContext } from "@/lib/scheduler/executionLogStore";
import { buildWeightConfigSnapshotMetadata } from "@/lib/recommendation/weightConfigRuntime";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const FIXED_NOW = Date.parse("2026-07-18T10:00:00.000Z");

function buildRow(input: {
  id: string;
  version: number;
  status: WeightConfigVersionRow["status"];
}): WeightConfigVersionRow {
  return {
    id: input.id,
    version: input.version,
    status: input.status,
    provider_weights: { ...DEFAULT_PROVIDER_WEIGHTS },
    market_blend_weight: 0.6,
    source_report_snapshot: {},
    created_by: "tester",
    created_at: "2026-07-18T09:00:00.000Z",
    applied_at: input.status === "active" ? "2026-07-18T09:30:00.000Z" : null,
    archived_at: input.status === "archived" ? "2026-07-18T09:45:00.000Z" : null,
  };
}

function buildRuntimeFromRow(row: WeightConfigVersionRow): RuntimeWeightConfig {
  return {
    providerWeights: { ...DEFAULT_PROVIDER_WEIGHTS },
    marketBlendWeight: 0.6,
    source: "active",
    activeVersion: {
      id: row.id,
      version: row.version,
      status: row.status,
      providerWeights: { ...DEFAULT_PROVIDER_WEIGHTS },
      marketBlendWeight: 0.6,
      sourceReportSnapshot: {},
      createdBy: "tester",
      createdAt: row.created_at,
      appliedAt: row.applied_at,
      archivedAt: row.archived_at,
    },
  };
}

async function testActivateInvalidatesRuntimeCache(): Promise<void> {
  resetRuntimeWeightConfigCacheForTests();
  const store = new InMemoryWeightConfigTransactionStore();
  store.seed(buildRow({ id: "draft-1", version: 1, status: "draft" }));

  let activeId = "draft-1";
  let loadCalls = 0;

  process.env.USE_DB_WEIGHT_CONFIG = "true";
  process.env.WEIGHT_CONFIG_CACHE_TTL_MS = "60000";

  try {
    await loadRuntimeWeightConfigForProduction({
      now: () => FIXED_NOW,
      getActiveWeightConfig: async () => {
        loadCalls += 1;
        return buildRuntimeFromRow(buildRow({ id: activeId, version: 1, status: "active" }));
      },
      getActiveWeightConfigVersionId: async () => ({
        status: "ok",
        activeVersionId: activeId,
      }),
    });

    await activateWeightConfig("draft-1", { transactionStore: store });
    activeId = "draft-1";

    await loadRuntimeWeightConfigForProduction({
      now: () => FIXED_NOW,
      getActiveWeightConfig: async () => {
        loadCalls += 1;
        return buildRuntimeFromRow(buildRow({ id: activeId, version: 1, status: "active" }));
      },
      getActiveWeightConfigVersionId: async () => ({
        status: "ok",
        activeVersionId: activeId,
      }),
    });

    assert(loadCalls === 2, "activate should invalidate runtime cache and force reload");
  } finally {
    delete process.env.USE_DB_WEIGHT_CONFIG;
    delete process.env.WEIGHT_CONFIG_CACHE_TTL_MS;
    resetRuntimeWeightConfigCacheForTests();
  }
}

async function testRollbackInvalidatesRuntimeCache(): Promise<void> {
  resetRuntimeWeightConfigCacheForTests();
  const store = new InMemoryWeightConfigTransactionStore();
  store.seed(buildRow({ id: "active-2", version: 2, status: "active" }));
  store.seed(
    buildRow({ id: "archived-1", version: 1, status: "archived" })
  );

  let activeId = "active-2";
  let loadCalls = 0;

  process.env.USE_DB_WEIGHT_CONFIG = "true";
  process.env.WEIGHT_CONFIG_CACHE_TTL_MS = "60000";

  try {
    await loadRuntimeWeightConfigForProduction({
      now: () => FIXED_NOW,
      getActiveWeightConfig: async () => {
        loadCalls += 1;
        return buildRuntimeFromRow(buildRow({ id: activeId, version: 2, status: "active" }));
      },
      getActiveWeightConfigVersionId: async () => ({
        status: "ok",
        activeVersionId: activeId,
      }),
    });

    await rollbackWeightConfig("archived-1", { transactionStore: store });
    activeId = "archived-1";

    await loadRuntimeWeightConfigForProduction({
      now: () => FIXED_NOW,
      getActiveWeightConfig: async () => {
        loadCalls += 1;
        return buildRuntimeFromRow(buildRow({ id: activeId, version: 1, status: "active" }));
      },
      getActiveWeightConfigVersionId: async () => ({
        status: "ok",
        activeVersionId: activeId,
      }),
    });

    assert(loadCalls === 2, "rollback should invalidate runtime cache and force reload");
  } finally {
    delete process.env.USE_DB_WEIGHT_CONFIG;
    delete process.env.WEIGHT_CONFIG_CACHE_TTL_MS;
    resetRuntimeWeightConfigCacheForTests();
  }
}

async function testUnmutatedServiceCallsDoNotInvalidateRuntimeCache(): Promise<void> {
  resetRuntimeWeightConfigCacheForTests();
  let loadCalls = 0;

  process.env.USE_DB_WEIGHT_CONFIG = "true";
  process.env.WEIGHT_CONFIG_CACHE_TTL_MS = "60000";

  const deps = {
    now: () => FIXED_NOW,
    getActiveWeightConfig: async () => {
      loadCalls += 1;
      return buildRuntimeFromRow(buildRow({ id: "active-1", version: 1, status: "active" }));
    },
    getActiveWeightConfigVersionId: async () => ({
      status: "ok" as const,
      activeVersionId: "active-1",
    }),
  };

  try {
    await loadRuntimeWeightConfigForProduction(deps);
    await loadRuntimeWeightConfigForProduction(deps);
    assert(
      loadCalls === 1,
      "non-mutating paths such as draft create should not invalidate runtime cache"
    );
  } finally {
    delete process.env.USE_DB_WEIGHT_CONFIG;
    delete process.env.WEIGHT_CONFIG_CACHE_TTL_MS;
    resetRuntimeWeightConfigCacheForTests();
  }
}

function testExecutionLogWeightConfigMetadataShape(): void {
  const metadata = buildWeightConfigSnapshotMetadata({
    providerWeights: { ...DEFAULT_PROVIDER_WEIGHTS },
    marketBlendWeight: 0.6,
    source: "active",
    activeVersion: {
      id: "33333333-3333-4333-8333-333333333333",
      version: 5,
      status: "active",
      providerWeights: { ...DEFAULT_PROVIDER_WEIGHTS },
      marketBlendWeight: 0.6,
      sourceReportSnapshot: {},
      createdBy: "scheduler",
      createdAt: "2026-07-18T09:00:00.000Z",
      appliedAt: "2026-07-18T09:30:00.000Z",
      archivedAt: null,
    },
    loadedAt: "2026-07-18T10:00:00.000Z",
  });

  const context = buildExecutionLogContext({
    jobType: "daily_analysis",
    status: "success",
    weightConfig: metadata,
  });

  assert(
    context.weightConfig !== undefined &&
      typeof context.weightConfig === "object" &&
      context.weightConfig !== null,
    "execution log context should include weightConfig"
  );

  const logged = context.weightConfig as {
    versionId: string | null;
    version: number | null;
    source: string;
    loadedAt: string;
  };

  assert(
    logged.versionId === "33333333-3333-4333-8333-333333333333",
    "execution log weightConfig.versionId"
  );
  assert(logged.version === 5, "execution log weightConfig.version");
  assert(logged.source === "active", "execution log weightConfig.source");
  assert(logged.loadedAt === "2026-07-18T10:00:00.000Z", "execution log weightConfig.loadedAt");
}

export async function runWeightConfigServiceLifecycleTests(): Promise<void> {
  await testActivateInvalidatesRuntimeCache();
  await testRollbackInvalidatesRuntimeCache();
  await testUnmutatedServiceCallsDoNotInvalidateRuntimeCache();
  testExecutionLogWeightConfigMetadataShape();
}

runWeightConfigServiceLifecycleTests()
  .then(() => {
    console.log("Weight config service lifecycle tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
