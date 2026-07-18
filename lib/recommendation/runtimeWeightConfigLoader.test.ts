import { FEATURE_PROVIDER_KEYS } from "@/lib/providers/registry/types";
import { MARKET_ENGINE_INITIAL_WEIGHT } from "@/lib/recommendation/marketEngine/marketScore";
import { DEFAULT_PROVIDER_WEIGHTS } from "@/lib/recommendation/providerWeights";
import { buildFallbackWeightConfig } from "@/lib/recommendation/weightConfigRuntime";
import type { RuntimeWeightConfig } from "@/lib/recommendation/weightConfigTypes";
import {
  invalidateRuntimeWeightConfigCache,
  loadRuntimeWeightConfigForProduction,
  resetRuntimeWeightConfigCacheForTests,
} from "@/lib/recommendation/runtimeWeightConfigLoader";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNear(actual: number, expected: number, message: string, epsilon = 1e-9): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

const FIXED_NOW = Date.parse("2026-07-18T09:00:00.000Z");

function withEnv<T>(
  values: Record<string, string | undefined>,
  run: () => Promise<T> | T
): Promise<T> | T {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function buildActiveConfig(): RuntimeWeightConfig {
  return {
    providerWeights: {
      ...DEFAULT_PROVIDER_WEIGHTS,
      recentForm: 0.3,
      homeAway: 0.16,
    },
    marketBlendWeight: 0.55,
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
      marketBlendWeight: 0.55,
      sourceReportSnapshot: {},
      createdBy: "test",
      createdAt: "2026-07-18T08:00:00.000Z",
      appliedAt: "2026-07-18T08:30:00.000Z",
      archivedAt: null,
    },
  };
}

async function testKillSwitchUsesFallbackWithoutDb(): Promise<void> {
  resetRuntimeWeightConfigCacheForTests();
  let calls = 0;

  const config = await withEnv(
    {
      USE_DB_WEIGHT_CONFIG: "false",
      WEIGHT_CONFIG_CACHE_TTL_MS: "60000",
    },
    () =>
      loadRuntimeWeightConfigForProduction({
        now: () => FIXED_NOW,
        getActiveWeightConfig: async () => {
          calls += 1;
          return buildActiveConfig();
        },
      })
  );

  assert(calls === 0, "kill switch should not query DB");
  assert(config.source === "fallback", "kill switch should use fallback source");
  assertNear(config.marketBlendWeight, MARKET_ENGINE_INITIAL_WEIGHT, "fallback market blend");
  for (const key of FEATURE_PROVIDER_KEYS) {
    assertNear(config.providerWeights[key], DEFAULT_PROVIDER_WEIGHTS[key], `fallback ${key}`);
  }
}

async function testNoActiveRowReturnsFallback(): Promise<void> {
  resetRuntimeWeightConfigCacheForTests();

  const config = await withEnv(
    {
      USE_DB_WEIGHT_CONFIG: "true",
      WEIGHT_CONFIG_CACHE_TTL_MS: "0",
    },
    () =>
      loadRuntimeWeightConfigForProduction({
        now: () => FIXED_NOW,
        getActiveWeightConfig: async () => buildFallbackWeightConfig(),
      })
  );

  assert(config.source === "fallback", "no active row should resolve to fallback");
  assert(config.activeVersion === null, "fallback should not expose active version");
}

async function testRestErrorFallsBack(): Promise<void> {
  resetRuntimeWeightConfigCacheForTests();

  const config = await withEnv(
    {
      USE_DB_WEIGHT_CONFIG: "true",
      WEIGHT_CONFIG_CACHE_TTL_MS: "0",
    },
    () =>
      loadRuntimeWeightConfigForProduction({
        now: () => FIXED_NOW,
        getActiveWeightConfig: async () => {
          throw new Error("Supabase REST unavailable");
        },
      })
  );

  assert(config.source === "fallback", "REST error should fallback");
  assert(config.loadedAt === new Date(FIXED_NOW).toISOString(), "fallback loadedAt");
}

async function testMalformedConfigFallsBack(): Promise<void> {
  resetRuntimeWeightConfigCacheForTests();

  const config = await withEnv(
    {
      USE_DB_WEIGHT_CONFIG: "true",
      WEIGHT_CONFIG_CACHE_TTL_MS: "0",
    },
    () =>
      loadRuntimeWeightConfigForProduction({
        now: () => FIXED_NOW,
        getActiveWeightConfig: async () => {
          throw new Error("provider_weights.recentForm must be a finite number.");
        },
      })
  );

  assert(config.source === "fallback", "malformed config should fallback");
}

async function testActiveConfigLoadsSuccessfully(): Promise<void> {
  resetRuntimeWeightConfigCacheForTests();

  const config = await withEnv(
    {
      USE_DB_WEIGHT_CONFIG: "true",
      WEIGHT_CONFIG_CACHE_TTL_MS: "0",
    },
    () =>
      loadRuntimeWeightConfigForProduction({
        now: () => FIXED_NOW,
        getActiveWeightConfig: async () => buildActiveConfig(),
      })
  );

  assert(config.source === "active", "active config source");
  assert(config.activeVersion?.version === 7, "active version number");
  assertNear(config.marketBlendWeight, 0.55, "active market blend");
}

async function testCacheHitAvoidsSecondDbRead(): Promise<void> {
  resetRuntimeWeightConfigCacheForTests();
  let calls = 0;
  let nowMs = FIXED_NOW;

  const deps = {
    now: () => nowMs,
    getActiveWeightConfig: async () => {
      calls += 1;
      return buildActiveConfig();
    },
    getActiveWeightConfigVersionId: async () =>
      ({
        status: "ok" as const,
        activeVersionId: "11111111-1111-4111-8111-111111111111",
      }),
  };

  await withEnv(
    {
      USE_DB_WEIGHT_CONFIG: "true",
      WEIGHT_CONFIG_CACHE_TTL_MS: "60000",
    },
    async () => {
      const first = await loadRuntimeWeightConfigForProduction(deps);
      const second = await loadRuntimeWeightConfigForProduction(deps);

      assert(calls === 1, "cache hit should avoid second DB read");
      assert(first.loadedAt === second.loadedAt, "cache hit should reuse loadedAt");
      assert(first.activeVersion?.id === second.activeVersion?.id, "cache hit same config");
    }
  );
}

async function testCacheMissAfterTtlExpiry(): Promise<void> {
  resetRuntimeWeightConfigCacheForTests();
  let calls = 0;
  let nowMs = FIXED_NOW;

  const deps = {
    now: () => nowMs,
    getActiveWeightConfig: async () => {
      calls += 1;
      return buildActiveConfig();
    },
    getActiveWeightConfigVersionId: async () =>
      ({
        status: "ok" as const,
        activeVersionId: "11111111-1111-4111-8111-111111111111",
      }),
  };

  await withEnv(
    {
      USE_DB_WEIGHT_CONFIG: "true",
      WEIGHT_CONFIG_CACHE_TTL_MS: "1000",
    },
    async () => {
      await loadRuntimeWeightConfigForProduction(deps);
      nowMs += 1001;
      await loadRuntimeWeightConfigForProduction(deps);
      assert(calls === 2, "expired cache should trigger another DB read");
    }
  );
}

async function testInvalidateClearsCache(): Promise<void> {
  resetRuntimeWeightConfigCacheForTests();
  let calls = 0;

  const deps = {
    now: () => FIXED_NOW,
    getActiveWeightConfig: async () => {
      calls += 1;
      return buildActiveConfig();
    },
    getActiveWeightConfigVersionId: async () =>
      ({
        status: "ok" as const,
        activeVersionId: "11111111-1111-4111-8111-111111111111",
      }),
  };

  await withEnv(
    {
      USE_DB_WEIGHT_CONFIG: "true",
      WEIGHT_CONFIG_CACHE_TTL_MS: "60000",
    },
    async () => {
      await loadRuntimeWeightConfigForProduction(deps);
      invalidateRuntimeWeightConfigCache();
      await loadRuntimeWeightConfigForProduction(deps);
      assert(calls === 2, "invalidate should force a fresh load");
    }
  );
}

async function testCacheVersionMismatchReloads(): Promise<void> {
  resetRuntimeWeightConfigCacheForTests();
  let calls = 0;
  let activeVersionId = "11111111-1111-4111-8111-111111111111";

  const deps = {
    now: () => FIXED_NOW,
    getActiveWeightConfig: async () => {
      calls += 1;
      const config = buildActiveConfig();
      if (calls >= 2) {
        return {
          ...config,
          activeVersion: config.activeVersion
            ? {
                ...config.activeVersion,
                id: "22222222-2222-4222-8222-222222222222",
                version: 8,
              }
            : null,
        };
      }
      return config;
    },
    getActiveWeightConfigVersionId: async () =>
      ({
        status: "ok" as const,
        activeVersionId,
      }),
  };

  await withEnv(
    {
      USE_DB_WEIGHT_CONFIG: "true",
      WEIGHT_CONFIG_CACHE_TTL_MS: "60000",
    },
    async () => {
      const first = await loadRuntimeWeightConfigForProduction(deps);
      assert(
        first.activeVersion?.id === "11111111-1111-4111-8111-111111111111",
        "initial cache version"
      );

      activeVersionId = "22222222-2222-4222-8222-222222222222";
      const second = await loadRuntimeWeightConfigForProduction(deps);

      assert(calls === 2, "version mismatch should reload from DB");
      assert(
        second.activeVersion?.id === "22222222-2222-4222-8222-222222222222",
        "reloaded active version id"
      );
    }
  );
}

async function testCacheVersionCheckFailureUsesCache(): Promise<void> {
  resetRuntimeWeightConfigCacheForTests();
  let calls = 0;

  const deps = {
    now: () => FIXED_NOW,
    getActiveWeightConfig: async () => {
      calls += 1;
      return buildActiveConfig();
    },
    getActiveWeightConfigVersionId: async () => ({ status: "failed" as const }),
  };

  await withEnv(
    {
      USE_DB_WEIGHT_CONFIG: "true",
      WEIGHT_CONFIG_CACHE_TTL_MS: "60000",
    },
    async () => {
      await loadRuntimeWeightConfigForProduction(deps);
      await loadRuntimeWeightConfigForProduction(deps);
      assert(calls === 1, "version check failure should keep cached config");
    }
  );
}

async function testLoaderNeverThrows(): Promise<void> {
  resetRuntimeWeightConfigCacheForTests();

  await withEnv(
    {
      USE_DB_WEIGHT_CONFIG: "true",
      WEIGHT_CONFIG_CACHE_TTL_MS: "0",
    },
    async () => {
      const config = await loadRuntimeWeightConfigForProduction({
        now: () => FIXED_NOW,
        getActiveWeightConfig: async () => {
          throw new Error("timeout");
        },
      });
      assert(config.source === "fallback", "loader must always resolve");
    }
  );
}

export async function runRuntimeWeightConfigLoaderTests(): Promise<void> {
  await testKillSwitchUsesFallbackWithoutDb();
  await testNoActiveRowReturnsFallback();
  await testRestErrorFallsBack();
  await testMalformedConfigFallsBack();
  await testActiveConfigLoadsSuccessfully();
  await testCacheHitAvoidsSecondDbRead();
  await testCacheMissAfterTtlExpiry();
  await testInvalidateClearsCache();
  await testCacheVersionMismatchReloads();
  await testCacheVersionCheckFailureUsesCache();
  await testLoaderNeverThrows();
}

runRuntimeWeightConfigLoaderTests()
  .then(() => {
    console.log("Runtime weight config loader tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
