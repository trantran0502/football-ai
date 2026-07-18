import { readFileSync } from "node:fs";
import path from "node:path";
import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import { FEATURE_PROVIDER_KEYS } from "@/lib/providers/registry/types";
import { MARKET_ENGINE_INITIAL_WEIGHT } from "@/lib/recommendation/marketEngine/marketScore";
import { DEFAULT_PROVIDER_WEIGHTS } from "@/lib/recommendation/providerWeights";
import { buildFallbackWeightConfig } from "@/lib/recommendation/weightConfigRuntime";
import {
  sanitizeLoadedRuntimeWeightConfigForBrowser,
  toLoadedRuntimeWeightConfigFromBrowser,
} from "@/lib/recommendation/runtimeWeightConfigBrowser";
import type {
  BrowserRuntimeWeightConfig,
  LoadedRuntimeWeightConfig,
} from "@/lib/recommendation/weightConfigTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function buildLoadedConfig(overrides: Partial<LoadedRuntimeWeightConfig> = {}): LoadedRuntimeWeightConfig {
  const fallback = buildFallbackWeightConfig();
  return {
    ...fallback,
    loadedAt: "2026-07-18T09:00:00.000Z",
    ...overrides,
  };
}

function buildActiveLoadedConfig(): LoadedRuntimeWeightConfig {
  return buildLoadedConfig({
    source: "active",
    marketBlendWeight: 0.42,
    providerWeights: {
      ...DEFAULT_PROVIDER_WEIGHTS,
      recentForm: 0.3,
      homeAway: 0.16,
    },
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
      sourceReportSnapshot: {
        summary: "optimizer snapshot must not leak to browser",
      },
      createdBy: "admin-user",
      createdAt: "2026-07-18T08:00:00.000Z",
      appliedAt: "2026-07-18T08:30:00.000Z",
      archivedAt: null,
    },
  });
}

const SAMPLE_ODDS = `Arsenal vs Chelsea
獨贏
主 1.85
和 3.4
客 4.2`;

function testSanitizeDtoShape(): void {
  const dto = sanitizeLoadedRuntimeWeightConfigForBrowser(buildActiveLoadedConfig());
  const keys = Object.keys(dto).sort();
  assert(
    keys.join(",") === "activeVersion,loadedAt,marketBlendWeight,providerWeights,source",
    "browser dto should only expose allowed top-level fields"
  );
  assert(dto.activeVersion !== null, "active version metadata should remain");
  assert(Object.keys(dto.activeVersion!).sort().join(",") === "id,version", "activeVersion should only expose id/version");
  assertNear(dto.marketBlendWeight, 0.42, "marketBlendWeight");
  assertNear(dto.providerWeights.recentForm, 0.3, "providerWeights.recentForm");
  assert(dto.source === "active", "source");
  assert(dto.loadedAt === "2026-07-18T09:00:00.000Z", "loadedAt");
}

function testSanitizeStripsSensitiveFields(): void {
  const dto = sanitizeLoadedRuntimeWeightConfigForBrowser(buildActiveLoadedConfig());
  const serialized = JSON.stringify(dto);
  assert(!serialized.includes("sourceReportSnapshot"), "dto must not include sourceReportSnapshot");
  assert(!serialized.includes("createdBy"), "dto must not include createdBy");
  assert(!serialized.includes("appliedAt"), "dto must not include appliedAt");
  assert(!serialized.includes("archivedAt"), "dto must not include archivedAt");
  assert(!serialized.includes("status"), "dto must not include status");
}

function testFallbackDto(): void {
  const dto = sanitizeLoadedRuntimeWeightConfigForBrowser(
    buildLoadedConfig({
      source: "fallback",
      marketBlendWeight: MARKET_ENGINE_INITIAL_WEIGHT,
      activeVersion: null,
    })
  );

  assert(dto.source === "fallback", "fallback source");
  assert(dto.activeVersion === null, "fallback dto should not expose activeVersion");
  for (const key of FEATURE_PROVIDER_KEYS) {
    assert(typeof dto.providerWeights[key] === "number", `fallback provider weight ${key}`);
  }
}

function testToLoadedRuntimeWeightConfigFromBrowser(): void {
  const dto: BrowserRuntimeWeightConfig = sanitizeLoadedRuntimeWeightConfigForBrowser(
    buildActiveLoadedConfig()
  );
  const loaded = toLoadedRuntimeWeightConfigFromBrowser(dto);

  assertNear(loaded.marketBlendWeight, dto.marketBlendWeight, "round-trip marketBlendWeight");
  assert(loaded.activeVersion?.id === dto.activeVersion?.id, "round-trip activeVersion.id");
  assert(loaded.activeVersion?.version === dto.activeVersion?.version, "round-trip activeVersion.version");
  assert(loaded.source === dto.source, "round-trip source");
  assert(loaded.loadedAt === dto.loadedAt, "round-trip loadedAt");
}

function testAnalyzeMatchUsesBrowserRuntimeWeightConfig(): void {
  const dto = sanitizeLoadedRuntimeWeightConfigForBrowser(buildActiveLoadedConfig());
  const report = analyzeMatch(SAMPLE_ODDS, {
    runtimeWeightConfig: toLoadedRuntimeWeightConfigFromBrowser(dto),
  });

  assert(report.weightConfig !== null, "report should expose weightConfig metadata");
  assert(report.weightConfig?.source === "active", "report weightConfig source");
  assert(report.weightConfig?.version === 7, "report weightConfig version");
  assert(
    report.weightConfig?.versionId === "11111111-1111-4111-8111-111111111111",
    "report weightConfig versionId"
  );
}

function testAnalyzeMatchFallbackWithoutRuntimeWeightConfig(): void {
  const report = analyzeMatch(SAMPLE_ODDS);
  assert(report.weightConfig !== null, "fallback report should expose weightConfig metadata");
  assert(report.weightConfig?.source === "fallback", "inline fallback source");
  assert(report.weightConfig?.versionId === null, "fallback versionId");
}

function testAnalyzeMatchFallbackWhenActionFails(): void {
  // Mirrors app/page.tsx catch branch when Server Action fails before analyzeMatch.
  const report = analyzeMatch(SAMPLE_ODDS);
  assert(report.weightConfig?.source === "fallback", "action failure should fall back to inline weights");
}

function testClientSafeModulesDoNotReferenceSecrets(): void {
  const projectRoot = process.cwd();
  const clientSafeFiles = [
    "lib/recommendation/runtimeWeightConfigBrowser.ts",
    "app/page.tsx",
  ];
  const forbiddenPatterns = [
    "getSupabaseAdmin",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ADMIN_API_KEY",
    "loadRuntimeWeightConfigForProduction",
    "fetchBrowserRuntimeWeightConfig",
  ];

  for (const relativePath of clientSafeFiles) {
    const contents = readFileSync(path.join(projectRoot, relativePath), "utf8");
    for (const pattern of forbiddenPatterns) {
      assert(
        !contents.includes(pattern),
        `${relativePath} must not reference ${pattern}`
      );
    }
  }
}

function assertNear(actual: number, expected: number, message: string, epsilon = 1e-9): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function runTests(): void {
  testSanitizeDtoShape();
  testSanitizeStripsSensitiveFields();
  testFallbackDto();
  testToLoadedRuntimeWeightConfigFromBrowser();
  testAnalyzeMatchUsesBrowserRuntimeWeightConfig();
  testAnalyzeMatchFallbackWithoutRuntimeWeightConfig();
  testAnalyzeMatchFallbackWhenActionFails();
  testClientSafeModulesDoNotReferenceSecrets();
  console.log("All runtimeWeightConfigBrowser tests passed.");
}

runTests();
