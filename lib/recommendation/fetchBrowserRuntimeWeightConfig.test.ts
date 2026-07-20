import { fetchBrowserRuntimeWeightConfig } from "@/lib/recommendation/fetchBrowserRuntimeWeightConfig";
import { resetRuntimeWeightConfigCacheForTests } from "@/lib/recommendation/runtimeWeightConfigLoader";
import { DEFAULT_PROVIDER_WEIGHTS } from "@/lib/recommendation/providerWeights";
import { buildFallbackWeightConfig } from "@/lib/recommendation/weightConfigRuntime";
import { PRODUCTION_BASELINE_WEIGHT_CONFIG_VERSION } from "@/lib/recommendation/productionWeightConfig";
import type { RuntimeWeightConfig } from "@/lib/recommendation/weightConfigTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const FIXED_NOW = Date.parse("2026-07-18T09:00:00.000Z");

function buildActiveConfig(): RuntimeWeightConfig {
  return {
    providerWeights: {
      ...DEFAULT_PROVIDER_WEIGHTS,
      recentForm: 0.3,
      homeAway: 0.16,
    },
    marketBlendWeight: 0.42,
    source: "active",
    activeVersion: {
      id: "11111111-1111-4111-8111-111111111111",
      version: 7,
      status: "active",
      providerWeights: {
        ...DEFAULT_PROVIDER_WEIGHTS,
        recentForm: 0.3,
        homeAway: 0.16,
      },
      marketBlendWeight: 0.42,
      sourceReportSnapshot: { summary: "must not leak" },
      createdBy: "admin-user",
      createdAt: "2026-07-18T08:00:00.000Z",
      appliedAt: "2026-07-18T08:30:00.000Z",
      archivedAt: null,
    },
  };
}

async function testFetchBrowserRuntimeWeightConfigSuccess(): Promise<void> {
  resetRuntimeWeightConfigCacheForTests();
  const previousUseDb = process.env.USE_DB_WEIGHT_CONFIG;
  const previousTtl = process.env.WEIGHT_CONFIG_CACHE_TTL_MS;
  process.env.USE_DB_WEIGHT_CONFIG = "true";
  process.env.WEIGHT_CONFIG_CACHE_TTL_MS = "0";

  try {
    const dto = await fetchBrowserRuntimeWeightConfig({
      now: () => FIXED_NOW,
      getActiveWeightConfig: async () => buildActiveConfig(),
    });

    assert(dto.source === "active", "action success should return active source");
    assert(dto.activeVersion?.id === "11111111-1111-4111-8111-111111111111", "active version id");
    assert(dto.activeVersion?.version === 7, "active version number");
    assertNear(dto.marketBlendWeight, 0.42, "marketBlendWeight");
    assert(!JSON.stringify(dto).includes("sourceReportSnapshot"), "dto must not leak snapshot");
  } finally {
    if (previousUseDb === undefined) {
      delete process.env.USE_DB_WEIGHT_CONFIG;
    } else {
      process.env.USE_DB_WEIGHT_CONFIG = previousUseDb;
    }
    if (previousTtl === undefined) {
      delete process.env.WEIGHT_CONFIG_CACHE_TTL_MS;
    } else {
      process.env.WEIGHT_CONFIG_CACHE_TTL_MS = previousTtl;
    }
  }
}

async function testFetchBrowserRuntimeWeightConfigFallback(): Promise<void> {
  resetRuntimeWeightConfigCacheForTests();
  const previousUseDb = process.env.USE_DB_WEIGHT_CONFIG;
  const previousTtl = process.env.WEIGHT_CONFIG_CACHE_TTL_MS;
  process.env.USE_DB_WEIGHT_CONFIG = "true";
  process.env.WEIGHT_CONFIG_CACHE_TTL_MS = "0";

  try {
    const dto = await fetchBrowserRuntimeWeightConfig({
      now: () => FIXED_NOW,
      getActiveWeightConfig: async () => {
        throw new Error("db unavailable");
      },
    });

    assert(dto.source === "production_baseline", "loader fallback should surface production baseline in browser dto");
    assert(
      dto.activeVersion?.id === PRODUCTION_BASELINE_WEIGHT_CONFIG_VERSION,
      "fallback dto should expose production baseline version id"
    );
  } finally {
    if (previousUseDb === undefined) {
      delete process.env.USE_DB_WEIGHT_CONFIG;
    } else {
      process.env.USE_DB_WEIGHT_CONFIG = previousUseDb;
    }
    if (previousTtl === undefined) {
      delete process.env.WEIGHT_CONFIG_CACHE_TTL_MS;
    } else {
      process.env.WEIGHT_CONFIG_CACHE_TTL_MS = previousTtl;
    }
  }
}

async function testFetchBrowserRuntimeWeightConfigUsesFallbackWhenDisabled(): Promise<void> {
  resetRuntimeWeightConfigCacheForTests();
  const previous = process.env.USE_DB_WEIGHT_CONFIG;
  process.env.USE_DB_WEIGHT_CONFIG = "false";

  try {
    const dto = await fetchBrowserRuntimeWeightConfig({
      now: () => FIXED_NOW,
      getActiveWeightConfig: async () => {
        throw new Error("should not be called when db weight config disabled");
      },
    });

    assert(dto.source === "production_baseline", "disabled db config should return production baseline dto");
    assert(
      dto.activeVersion?.id === PRODUCTION_BASELINE_WEIGHT_CONFIG_VERSION,
      "disabled db config should expose production baseline version"
    );
  } finally {
    if (previous === undefined) {
      delete process.env.USE_DB_WEIGHT_CONFIG;
    } else {
      process.env.USE_DB_WEIGHT_CONFIG = previous;
    }
  }
}

function assertNear(actual: number, expected: number, message: string, epsilon = 1e-9): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

async function runTests(): Promise<void> {
  resetRuntimeWeightConfigCacheForTests();
  await testFetchBrowserRuntimeWeightConfigSuccess();
  await testFetchBrowserRuntimeWeightConfigFallback();
  await testFetchBrowserRuntimeWeightConfigUsesFallbackWhenDisabled();
  console.log("All fetchBrowserRuntimeWeightConfig tests passed.");
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
