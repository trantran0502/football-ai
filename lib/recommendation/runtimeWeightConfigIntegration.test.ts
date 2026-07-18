import { fuseFeatureScores, type FeatureScore } from "@/lib/analysis/featureScore";
import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import { createAnalysisSnapshotFromReport } from "@/lib/database/matchSchema";
import { FEATURE_PROVIDER_KEYS } from "@/lib/providers/registry/types";
import { MARKET_ENGINE_INITIAL_WEIGHT } from "@/lib/recommendation/marketEngine/marketScore";
import {
  blendFeatureAndMarketEngineScore,
} from "@/lib/recommendation/marketEngineIntegration";
import { DEFAULT_PROVIDER_WEIGHTS } from "@/lib/recommendation/providerWeights";
import { computeProviderWeighting } from "@/lib/recommendation/providerWeightEngine";
import { generateRecommendations } from "@/lib/recommendation/recommendationEngine";
import { buildFallbackWeightConfig } from "@/lib/recommendation/weightConfigRuntime";
import type { LoadedRuntimeWeightConfig } from "@/lib/recommendation/weightConfigTypes";
import { runDailyMatchPipeline } from "@/lib/production/dailyMatchPipeline";
import type { ProductionFixture } from "@/lib/production/productionTypes";
import type { ProviderResolutionAudit } from "@/lib/providers/teamProfile/teamProfileProviderPipeline";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNear(actual: number, expected: number, message: string, epsilon = 1e-4): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function makeFeature(id: string, score: number, confidence: number): FeatureScore {
  return {
    id,
    category: "moneyline",
    score,
    weight: 1,
    confidence,
    reason: `Synthetic ${id}`,
  };
}

function buildAudit(): ProviderResolutionAudit {
  const resolved = FEATURE_PROVIDER_KEYS.map((key) => ({
    key,
    source: "matchRecords" as const,
    confidence: 0.72,
    warnings: [],
    data: {},
    available: true,
  }));

  return {
    resolved,
    mockProviderCount: 0,
    unavailableProviderCount: 0,
    teamProfileProviderCount: 8,
    criticalProvidersUnavailable: false,
    providerSources: Object.fromEntries(
      FEATURE_PROVIDER_KEYS.map((key) => [key, "matchRecords" as const])
    ),
  };
}

function buildLoadedConfig(overrides: Partial<LoadedRuntimeWeightConfig> = {}): LoadedRuntimeWeightConfig {
  const fallback = buildFallbackWeightConfig();
  return {
    ...fallback,
    loadedAt: "2026-07-18T09:00:00.000Z",
    ...overrides,
  };
}

function testInjectedProviderWeights(): void {
  const fusion = fuseFeatureScores([
    makeFeature("recent_form.win_rate", 40, 0.8),
    makeFeature("home_away.home_advantage", 35, 0.75),
    makeFeature("goals_xg.expected_goal_advantage", 30, 0.74),
  ]);

  const customWeights = {
    ...DEFAULT_PROVIDER_WEIGHTS,
    recentForm: 0.5,
    homeAway: 0.1,
    goalsXg: 0.1,
    scoringPattern: 0.1,
    leagueStrength: 0.05,
    h2h: 0.05,
    squadAvailability: 0.05,
    matchContext: 0.05,
  };

  const defaultWeighting = computeProviderWeighting(fusion, buildAudit());
  const customWeighting = computeProviderWeighting(fusion, buildAudit(), customWeights);

  const defaultRecentForm = defaultWeighting.diagnostics.find(
    (entry) => entry.providerKey === "recentForm"
  )!;
  const customRecentForm = customWeighting.diagnostics.find(
    (entry) => entry.providerKey === "recentForm"
  )!;

  assert(
    customRecentForm.providerWeight > defaultRecentForm.providerWeight,
    "injected provider weights should change normalized recentForm weight"
  );
}

function testInjectedMarketBlend(): void {
  const featureScore = 20;
  const marketSideScore = 50;

  const defaultBlend = blendFeatureAndMarketEngineScore(featureScore, marketSideScore);
  const heavyMarketBlend = blendFeatureAndMarketEngineScore(featureScore, marketSideScore, 0.9);

  assert(heavyMarketBlend > defaultBlend, "higher market blend should increase blended score when market side is stronger");
  assertNear(
    heavyMarketBlend,
    featureScore * 0.1 + marketSideScore * 0.9,
    "market blend formula"
  );
}

function testGenerateRecommendationsMetadata(): void {
  const fusion = fuseFeatureScores([
    makeFeature("recent_form.win_rate", 40, 0.8),
    makeFeature("home_away.home_advantage", 35, 0.75),
    makeFeature("goals_xg.expected_goal_advantage", 30, 0.74),
  ]);

  const runtimeWeightConfig = buildLoadedConfig({
    source: "active",
    marketBlendWeight: 0.55,
    activeVersion: {
      id: "22222222-2222-4222-8222-222222222222",
      version: 3,
      status: "active",
      providerWeights: { ...DEFAULT_PROVIDER_WEIGHTS },
      marketBlendWeight: 0.55,
      sourceReportSnapshot: {},
      createdBy: "test",
      createdAt: "2026-07-18T08:00:00.000Z",
      appliedAt: "2026-07-18T08:30:00.000Z",
      archivedAt: null,
    },
  });

  const result = generateRecommendations(fusion, [], {
    providerAudit: buildAudit(),
    runtimeWeightConfig,
  });

  assert(result.weightConfig !== null, "weightConfig metadata should be present");
  assert(result.weightConfig?.source === "active", "metadata source");
  assert(result.weightConfig?.version === 3, "metadata version");
  assert(
    result.weightConfig?.versionId === "22222222-2222-4222-8222-222222222222",
    "metadata versionId"
  );
  assert(
    result.weightConfig?.loadedAt === runtimeWeightConfig.loadedAt,
    "metadata loadedAt"
  );
}

function testSnapshotMetadataFromAnalyzeMatch(): void {
  const runtimeWeightConfig = buildLoadedConfig({
    source: "fallback",
    marketBlendWeight: MARKET_ENGINE_INITIAL_WEIGHT,
    activeVersion: null,
  });

  const sampleOdds = `Arsenal vs Chelsea
獨贏
主 1.85
和 3.4
客 4.2`;

  const report = analyzeMatch(sampleOdds, { runtimeWeightConfig });
  assert(report.weightConfig !== null, "report should expose weightConfig metadata");
  assert(report.weightConfig?.source === "fallback", "snapshot fallback source");

  const snapshot = createAnalysisSnapshotFromReport(report, "2026-07-18T09:00:00.000Z", "match-1");
  assert(snapshot.weightConfig !== null, "analysis snapshot should store weightConfig");
  assert(
    snapshot.weightConfig?.loadedAt === runtimeWeightConfig.loadedAt,
    "snapshot loadedAt should match runtime config"
  );
}

async function testDailyPipelineLoadsWeightConfigOnce(): Promise<void> {
  let loadCalls = 0;
  const runtimeWeightConfig = buildLoadedConfig();

  const fixture: ProductionFixture = {
    matchDate: "2026-07-18",
    league: "Premier League",
    leagueName: "Premier League",
    leagueId: 39,
    season: 2025,
    fixtureId: 9001,
    kickoffTime: "2026-07-18T19:00:00.000Z",
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    homeTeamId: 1,
    awayTeamId: 2,
    rawOdds: `Arsenal vs Chelsea
獨贏
主 1.85
和 3.4
客 4.2`,
  };

  await runDailyMatchPipeline([fixture, { ...fixture, fixtureId: 9002 }], "2026-07-18", {
    loadRuntimeWeightConfig: async () => {
      loadCalls += 1;
      return runtimeWeightConfig;
    },
    saveMatch: async () => ({
      status: "created",
      record: {
        id: "created-1",
        date: "2026-07-18",
        matchDate: "2026-07-18",
        league: fixture.league,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        rawOdds: fixture.rawOdds,
        marketSelections: [],
        result: null,
        analysisSnapshot: null,
        candidates: [],
        status: "PENDING",
        verificationResult: null,
        createdAt: "2026-07-18T09:00:00.000Z",
        updatedAt: "2026-07-18T09:00:00.000Z",
      },
    }),
  });

  assert(loadCalls === 1, "daily pipeline batch should load runtime weight config once");
}

export async function runRuntimeWeightConfigIntegrationTests(): Promise<void> {
  testInjectedProviderWeights();
  testInjectedMarketBlend();
  testGenerateRecommendationsMetadata();
  testSnapshotMetadataFromAnalyzeMatch();
  await testDailyPipelineLoadsWeightConfigOnce();
}

runRuntimeWeightConfigIntegrationTests()
  .then(() => {
    console.log("Runtime weight config integration tests passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
