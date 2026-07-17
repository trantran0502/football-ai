import { fuseFeatureScores, type FeatureScore } from "@/lib/analysis/featureScore";
import { generateRecommendations } from "@/lib/recommendation/recommendationEngine";
import {
  computeProviderWeighting,
  type ProviderRecommendationDiagnostic,
} from "@/lib/recommendation/providerWeightEngine";
import { DEFAULT_PROVIDER_WEIGHTS } from "@/lib/recommendation/providerWeights";
import { runWeightOptimizerTests } from "./test-weight-optimizer";
import type { ProviderResolutionAudit } from "@/lib/providers/teamProfile/teamProfileProviderPipeline";
import type { FeatureProviderKey, ProviderDataSource } from "@/lib/providers/registry/types";
import { FEATURE_PROVIDER_KEYS } from "@/lib/providers/registry/types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNear(actual: number, expected: number, message: string, tolerance = 1e-4): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ~${expected}, got ${actual}`);
  }
}

function makeFeature(id: string, score: number, confidence: number, weight = 1): FeatureScore {
  return {
    id,
    category: "moneyline",
    score,
    weight,
    confidence,
    reason: `Synthetic ${id}`,
  };
}

function buildAudit(sources: Partial<Record<FeatureProviderKey, ProviderDataSource>>): ProviderResolutionAudit {
  const resolved = FEATURE_PROVIDER_KEYS.map((key) => ({
    key,
    source: sources[key] ?? "unavailable",
    confidence: sources[key] === "unavailable" ? 0.1 : 0.72,
    warnings: [],
    data: {},
    available: sources[key] !== "unavailable" && sources[key] !== "mock",
  }));

  let unavailableProviderCount = 0;
  const providerSources: Partial<Record<FeatureProviderKey, ProviderDataSource>> = {};
  for (const key of FEATURE_PROVIDER_KEYS) {
    providerSources[key] = sources[key] ?? "unavailable";
    if (providerSources[key] === "unavailable") {
      unavailableProviderCount += 1;
    }
  }

  return {
    resolved,
    mockProviderCount: 0,
    unavailableProviderCount,
    teamProfileProviderCount: 0,
    criticalProvidersUnavailable: false,
    providerSources,
  };
}

function runTests(): void {
  const fusion = fuseFeatureScores([
    makeFeature("recent_form.win_rate", 40, 0.8),
    makeFeature("home_away.home_advantage", 35, 0.75),
    makeFeature("goals_xg.expected_goal_advantage", 30, 0.74),
    makeFeature("market_odds", 20, 0.8),
    makeFeature("scoring_pattern.combined_over_25", 25, 0.7),
    makeFeature("league_strength.league_rank", 10, 0.68),
    makeFeature("h2h.recent_momentum", 8, 0.65),
    makeFeature("squad_availability.injury_impact", 5, 0.6),
    makeFeature("match_context.rest_advantage", 6, 0.58),
  ]);

  const totalDefaultWeight = Object.values(DEFAULT_PROVIDER_WEIGHTS).reduce(
    (sum, weight) => sum + weight,
    0
  );
  assertNear(totalDefaultWeight, 1, "default provider weights should sum to 1");

  const partialAudit = buildAudit({
    recentForm: "matchRecords",
    homeAway: "matchRecords",
    goalsXg: "googleSearch",
  });
  const partialWeighting = computeProviderWeighting(fusion, partialAudit);
  assert(partialWeighting.usableProviderCount === 3, "should count 3 usable providers");
  assert(partialWeighting.unavailableProviderCount === 5, "should count 5 unavailable providers");

  const normalizedSum = partialWeighting.diagnostics
    .filter((entry) => entry.providerWeight > 0)
    .reduce((sum, entry) => sum + entry.providerWeight, 0);
  assertNear(normalizedSum, 1, "usable provider weights should renormalize to 1");

  const expectedRecentFormWeight =
    DEFAULT_PROVIDER_WEIGHTS.recentForm /
    (DEFAULT_PROVIDER_WEIGHTS.recentForm +
      DEFAULT_PROVIDER_WEIGHTS.homeAway +
      DEFAULT_PROVIDER_WEIGHTS.goalsXg);
  const recentFormDiagnostic = partialWeighting.diagnostics.find(
    (entry) => entry.providerKey === "recentForm"
  )!;
  assertNear(
    recentFormDiagnostic.providerWeight,
    expectedRecentFormWeight,
    "recentForm weight should renormalize among usable providers"
  );

  assert(
    partialWeighting.diagnostics.every(
      (entry: ProviderRecommendationDiagnostic) =>
        entry.providerSource !== "unavailable" || entry.providerWeight === 0
    ),
    "unavailable providers should not receive weight"
  );

  const expectedConfidence =
    0.72 * expectedRecentFormWeight +
    0.72 * (DEFAULT_PROVIDER_WEIGHTS.homeAway / (DEFAULT_PROVIDER_WEIGHTS.recentForm + DEFAULT_PROVIDER_WEIGHTS.homeAway + DEFAULT_PROVIDER_WEIGHTS.goalsXg)) +
    0.72 * (DEFAULT_PROVIDER_WEIGHTS.goalsXg / (DEFAULT_PROVIDER_WEIGHTS.recentForm + DEFAULT_PROVIDER_WEIGHTS.homeAway + DEFAULT_PROVIDER_WEIGHTS.goalsXg));
  assertNear(
    partialWeighting.overallConfidence,
    expectedConfidence,
    "overall confidence should be providerConfidence x weight"
  );

  const recommendation = generateRecommendations(fusion, [], {
    providerAudit: partialAudit,
  });
  assert(recommendation.usableProviderCount === 3, "recommendation should expose usable count");
  assert(recommendation.unavailableProviderCount === 5, "recommendation should expose unavailable count");
  assert(
    recommendation.providerDiagnostics.length === FEATURE_PROVIDER_KEYS.length,
    "diagnostics should include every provider"
  );
  assert(
    recommendation.providerOverallConfidence === partialWeighting.overallConfidence,
    "recommendation should expose provider-weighted overall confidence"
  );

  console.log("Provider weighting tests passed.");
  runWeightOptimizerTests();
}

runTests();

export {};
