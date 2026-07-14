import {
  FEATURE_WEIGHTS,
  buildFeatureScores,
  getFeatureWeight,
  registerFeatureCollector,
  resetFeatureCollectorsForTests,
  type FeatureScore,
} from "@/lib/analysis/featureScore";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function runTests(): void {
  resetFeatureCollectorsForTests();

  const empty = buildFeatureScores({});
  assert(empty.features.length === 0, "empty collectors should return no features");
  assert(empty.totalScore === 0, "empty totalScore should be 0");
  assert(empty.confidence === 0, "empty confidence should be 0");

  assert(FEATURE_WEIGHTS.homeAdvantage === 1, "homeAdvantage weight should be 1");
  assert(
    getFeatureWeight("marketOdds") === FEATURE_WEIGHTS.marketOdds,
    "getFeatureWeight should read from FEATURE_WEIGHTS"
  );

  registerFeatureCollector(() => [
    {
      id: "test.marketOdds",
      category: "moneyline",
      score: 0.8,
      weight: getFeatureWeight("marketOdds"),
      confidence: 0.7,
      reason: "test collector",
    },
    {
      id: "test.handicapSupport",
      category: "handicap",
      score: 0.4,
      weight: getFeatureWeight("handicapSupport"),
      confidence: 0.5,
      reason: "test collector",
    },
  ]);

  const result = buildFeatureScores({ metadata: { source: "unit-test" } });
  assert(result.features.length === 2, "collector should produce two features");
  assert(
    Math.abs(result.totalScore - 0.6) < 1e-9,
    `expected weighted totalScore 0.6, got ${result.totalScore}`
  );
  assert(
    Math.abs(result.confidence - 0.6) < 1e-9,
    `expected weighted confidence 0.6, got ${result.confidence}`
  );

  const categories = result.features.map((feature: FeatureScore) => feature.category);
  assert(
    categories.includes("moneyline") && categories.includes("handicap"),
    "features should preserve category"
  );

  resetFeatureCollectorsForTests();
  const afterReset = buildFeatureScores({});
  assert(afterReset.features.length === 0, "reset should clear collectors");

  console.log("Feature Score Engine tests passed.");
}

runTests();

export {};
