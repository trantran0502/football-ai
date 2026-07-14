import {
  FUSION_SOURCE_CATEGORIES,
  FeatureFusionEngine,
  fuseFeatureScores,
  resolveFusionSourceCategory,
  type FeatureScore,
} from "@/lib/analysis/featureScore";

const EPSILON = 1e-4;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNear(
  actual: number,
  expected: number,
  message: string,
  tolerance = EPSILON
): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ~${expected}, got ${actual}`);
  }
}

function makeFeature(
  id: string,
  score: number,
  confidence: number,
  weight = 1,
  metadata?: Record<string, unknown>
): FeatureScore {
  return {
    id,
    category: "moneyline",
    score,
    weight,
    confidence,
    reason: `Synthetic feature ${id}`,
    metadata,
  };
}

function buildFullFeatureSet(): FeatureScore[] {
  return [
    makeFeature("market_odds", 18, 0.82, 1),
    makeFeature("recent_form.win_rate", 42, 0.75, 1, {
      homeSampleSize: 10,
      awaySampleSize: 10,
    }),
    makeFeature("recent_form.momentum", 28, 0.7, 1, {
      homeSampleSize: 10,
      awaySampleSize: 10,
    }),
    makeFeature("league_strength.league_rank", 12, 0.68, 1),
    makeFeature("home_away.home_advantage", 35, 0.72, 1),
    makeFeature("goals_xg.expected_goal_advantage", 30, 0.71, 1),
    makeFeature("scoring_pattern.combined_over_25", 22, 0.66, 1, { sampleSize: 12 }),
    makeFeature("h2h.recent_momentum", 15, 0.55, 0.5, { sampleSize: 8 }),
    makeFeature("squad_availability.injury_impact", -20, 0.62, 0.7),
    makeFeature("match_context.rest_advantage", 10, 0.58, 0.55),
  ];
}

function assertBounds(result: ReturnType<typeof fuseFeatureScores>): void {
  assert(
    result.overallScore >= -100 && result.overallScore <= 100,
    "overallScore must stay within [-100, 100]"
  );
  assert(
    result.overallConfidence >= 0 && result.overallConfidence <= 1,
    "overallConfidence must stay within [0, 1]"
  );

  for (const category of result.categoryScores) {
    assert(
      category.totalScore >= -100 && category.totalScore <= 100,
      `${category.category} totalScore out of bounds`
    );
    assert(
      category.weightedScore >= -100 && category.weightedScore <= 100,
      `${category.category} weightedScore out of bounds`
    );
    assert(
      category.confidence >= 0 && category.confidence <= 1,
      `${category.category} confidence out of bounds`
    );
  }

  for (const factor of [
    ...result.strongestFactors,
    ...result.weakestFactors,
    ...result.ignoredFeatures,
  ]) {
    assert(
      factor.score >= -100 && factor.score <= 100,
      `${factor.id} score out of bounds`
    );
    assert(
      factor.confidence >= 0 && factor.confidence <= 1,
      `${factor.id} confidence out of bounds`
    );
  }
}

function assertNoBettingLanguage(result: ReturnType<typeof fuseFeatureScores>): void {
  const serialized = JSON.stringify(result);
  assert(!serialized.includes("下注"), "fusion output must not recommend betting");
  assert(!serialized.includes("推薦"), "fusion output must not recommend picks");
  assert(!serialized.toLowerCase().includes("recommend"), "fusion must stay descriptive");
}

function runTests(): void {
  assert(
    FUSION_SOURCE_CATEGORIES.length === 9,
    "fusion should expose nine source categories"
  );
  assert(
    resolveFusionSourceCategory("recent_form.win_rate") === "recentForm",
    "recent form prefix should resolve"
  );
  assert(
    resolveFusionSourceCategory("scoring_pattern.combined_btts") === "scoringPattern",
    "scoring pattern prefix should resolve"
  );
  assert(
    resolveFusionSourceCategory("unknown.feature") === "unknown",
    "unknown feature id should resolve to unknown"
  );

  const fullFeatures = buildFullFeatureSet();
  const fullResult = fuseFeatureScores(fullFeatures);
  assertBounds(fullResult);
  assertNoBettingLanguage(fullResult);
  assert(fullResult.categoryScores.length === 9, "should always return nine category scores");
  assert(
    fullResult.categoryScores.every((category) => category.featureCount <= 2),
    "full fixture should populate each category at most twice in this sample"
  );
  assert(
    fullResult.categoryScores.some((category) => category.featureCount > 0),
    "full fixture should have active category features"
  );
  assert(fullResult.strongestFactors.length === 5, "should return top five strongest factors");
  assert(fullResult.weakestFactors.length === 5, "should return top five weakest factors");
  assert(
    fullResult.strongestFactors[0].score >= fullResult.strongestFactors[4].score,
    "strongest factors should be sorted descending"
  );
  assert(
    fullResult.weakestFactors[0].score <= fullResult.weakestFactors[4].score,
    "weakest factors should be sorted ascending"
  );
  assert(
    fullResult.strongestFactors[0].id === "recent_form.win_rate",
    "recent_form.win_rate should be strongest in full fixture"
  );
  assert(
    fullResult.weakestFactors[0].id === "squad_availability.injury_impact",
    "injury impact should be weakest in full fixture"
  );
  assert(fullResult.ignoredFeatures.length === 0, "full fixture should ignore nothing");
  assert(
    !fullResult.warnings.some((warning) => warning.code === "insufficient_data"),
    "full fixture should not warn about insufficient data"
  );

  const conflictFeatures = [
    makeFeature("recent_form.win_rate", 60, 0.8, 1, {
      homeSampleSize: 10,
      awaySampleSize: 10,
    }),
    makeFeature("h2h.recent_momentum", -55, 0.6, 0.5, { sampleSize: 8 }),
    makeFeature("home_away.home_advantage", 50, 0.75, 1),
    makeFeature("squad_availability.injury_impact", -48, 0.7, 0.7),
    makeFeature("goals_xg.expected_goal_advantage", 12, 0.65, 1),
  ];
  const conflictResult = fuseFeatureScores(conflictFeatures);
  assert(
    conflictResult.warnings.some((warning) => warning.code === "feature_conflict"),
    "conflicting strong signals should emit feature_conflict warning"
  );

  const emptyResult = fuseFeatureScores([]);
  assert(emptyResult.overallScore === 0, "empty input should yield zero overall score");
  assert(emptyResult.overallConfidence === 0, "empty input should yield zero confidence");
  assert(emptyResult.strongestFactors.length === 0, "empty input should have no strongest factors");
  assert(emptyResult.weakestFactors.length === 0, "empty input should have no weakest factors");
  assert(emptyResult.ignoredFeatures.length === 0, "empty input should have no ignored features");
  assert(
    emptyResult.warnings.some((warning) => warning.code === "insufficient_data"),
    "empty input should warn about insufficient data"
  );
  assert(
    emptyResult.warnings.some((warning) => warning.code === "too_few_features"),
    "empty input should warn about too few features"
  );

  const lowConfidenceFeatures = [
    makeFeature("recent_form.win_rate", 40, 0.1, 1),
    makeFeature("h2h.recent_momentum", -30, 0.15, 0.5),
    makeFeature("goals_xg.home_xg", 20, 0.05, 1),
  ];
  const lowConfidenceResult = fuseFeatureScores(lowConfidenceFeatures);
  assert(
    lowConfidenceResult.ignoredFeatures.length === 3,
    "all low-confidence features should be ignored"
  );
  assert(
    lowConfidenceResult.overallScore === 0,
    "all ignored features should produce zero overall score"
  );
  assert(
    lowConfidenceResult.warnings.some((warning) => warning.code === "insufficient_data"),
    "all ignored features should warn about insufficient data"
  );
  assert(
    lowConfidenceResult.warnings.some((warning) => warning.code === "too_few_features"),
    "all ignored features should warn about too few active features"
  );

  const ignoredOnly = [
    makeFeature("recent_form.win_rate", 80, 0.19, 1),
    makeFeature("h2h.recent_momentum", -70, 0.05, 0.5),
  ];
  const ignoredResult = fuseFeatureScores(ignoredOnly);
  assert(ignoredResult.ignoredFeatures.length === 2, "ignoredFeatures should list low-confidence items");
  assert(
    ignoredResult.ignoredFeatures.every((feature) => feature.confidence < 0.2),
    "ignoredFeatures should only contain low-confidence features"
  );

  const boundaryFeatures = [
    makeFeature("recent_form.win_rate", 100, 1, 1),
    makeFeature("h2h.recent_momentum", -100, 1, 0.5),
    makeFeature("goals_xg.home_xg", 0, 0.2, 1),
    makeFeature("home_away.home_advantage", 25, 0.5, 1),
    makeFeature("match_context.travel_fatigue", -10, 0.4, 0.55),
  ];
  const boundaryResult = fuseFeatureScores(boundaryFeatures);
  assertBounds(boundaryResult);
  assertNear(boundaryResult.overallConfidence, 0.59753, "boundary confidence aggregate", 1e-3);

  const smallSampleFeatures = [
    makeFeature("recent_form.win_rate", 30, 0.7, 1, {
      homeSampleSize: 3,
      awaySampleSize: 4,
    }),
    makeFeature("scoring_pattern.combined_btts", 18, 0.65, 1, { sampleSize: 2 }),
    makeFeature("h2h.recent_momentum", 12, 0.55, 0.5, { sampleSize: 8 }),
    makeFeature("home_away.home_advantage", 20, 0.72, 1),
    makeFeature("goals_xg.home_xg", 15, 0.68, 1),
  ];
  const smallSampleResult = fuseFeatureScores(smallSampleFeatures);
  assert(
    smallSampleResult.warnings.some((warning) => warning.code === "small_sample_size"),
    "small sample metadata should emit small_sample_size warning"
  );

  const engine = new FeatureFusionEngine();
  const engineResult = engine.fuse(fullFeatures);
  assertNear(
    engineResult.overallScore,
    fullResult.overallScore,
    "FeatureFusionEngine should match fuseFeatureScores helper"
  );

  console.log("Feature Fusion tests passed.");
}

runTests();
