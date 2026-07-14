import {
  buildFeatureScores,
  getFeatureWeight,
  getRegisteredFeatureCollectors,
  SCORING_PATTERN_FEATURE_IDS,
  registerScoringPatternCollector,
  resetFeatureCollectorsForTests,
  resetScoringPatternCollectorRegistrationForTests,
  resetScoringPatternProviderForTests,
  isScoringPatternCollectorRegistered,
  type ScoringPatternFeatureMetadata,
} from "@/lib/analysis/featureScore";
import {
  MOCK_SCORING_PATTERN_FIXTURES,
  buildPartialScoringPatternSnapshot,
  createMockScoringPatternProvider,
  type ScoringPatternProvider,
} from "@/lib/analysis/featureScore/providers/scoringPatternProvider";

const EPSILON = 1e-4;
const ALL_FEATURE_IDS = Object.values(SCORING_PATTERN_FEATURE_IDS);

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNear(actual: number, expected: number, message: string): void {
  if (Math.abs(actual - expected) > EPSILON) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function getScoringPatternFeatures(
  features: ReturnType<typeof buildFeatureScores>["features"]
) {
  return features.filter((feature) => feature.id.startsWith("scoring_pattern."));
}

function getFeatureById(
  features: ReturnType<typeof buildFeatureScores>["features"],
  id: string
) {
  const feature = features.find((item) => item.id === id);
  assert(Boolean(feature), `feature ${id} should exist`);
  return feature!;
}

function getMetadata(feature: {
  metadata?: Record<string, unknown>;
}): ScoringPatternFeatureMetadata {
  return feature.metadata as unknown as ScoringPatternFeatureMetadata;
}

function assertBounds(features: ReturnType<typeof buildFeatureScores>["features"]): void {
  for (const feature of features) {
    assert(
      feature.score >= -100 && feature.score <= 100,
      `${feature.id} score must stay within [-100, 100]`
    );
    assert(
      feature.confidence >= 0 && feature.confidence <= 1,
      `${feature.id} confidence must stay within [0, 1]`
    );
    assert(
      !feature.reason.toLowerCase().includes("bet") &&
        !feature.reason.includes("推薦") &&
        !feature.reason.includes("下注"),
      `${feature.id} reason must not contain betting recommendation language`
    );
  }
}

function runTests(): void {
  resetFeatureCollectorsForTests();
  resetScoringPatternCollectorRegistrationForTests();
  resetScoringPatternProviderForTests();

  registerScoringPatternCollector();
  assert(isScoringPatternCollectorRegistered(), "collector should be registered");

  const collectorsAfterFirst = getRegisteredFeatureCollectors().length;
  registerScoringPatternCollector();
  assert(
    getRegisteredFeatureCollectors().length === collectorsAfterFirst,
    "duplicate registerScoringPatternCollector must not add another collector"
  );

  const highScoringResult = buildFeatureScores({
    metadata: {
      homeTeam: "High-Scoring Home",
      awayTeam: "High-Scoring Away",
    },
  });
  const highFeatures = getScoringPatternFeatures(highScoringResult.features);
  assert(highFeatures.length === 13, "full data should produce 13 scoring pattern features");

  const combinedOver25 = getFeatureById(
    highScoringResult.features,
    SCORING_PATTERN_FEATURE_IDS.combinedOver25
  );
  assert(combinedOver25.score > 0, "high-scoring matchup should have positive Combined Over 2.5");

  const combinedBtts = getFeatureById(
    highScoringResult.features,
    SCORING_PATTERN_FEATURE_IDS.combinedBtts
  );
  assert(combinedBtts.score > 0, "high BTTS rates should score positive for BTTS Yes tendency");
  assert(combinedBtts.category === "btts", "combined BTTS category");

  const lowScoringResult = buildFeatureScores({
    metadata: {
      homeTeam: "Low-Scoring Home",
      awayTeam: "MockAway FC",
    },
  });
  const lowCombinedBtts = getFeatureById(
    lowScoringResult.features,
    SCORING_PATTERN_FEATURE_IDS.combinedBtts
  );
  assert(
    lowCombinedBtts.score < combinedBtts.score,
    "low-scoring / BTTS No profile should score lower than high BTTS profile"
  );
  assert(lowCombinedBtts.score < 0, "low BTTS profile should be negative for BTTS Yes direction");

  const lowCombinedOver25 = getFeatureById(
    lowScoringResult.features,
    SCORING_PATTERN_FEATURE_IDS.combinedOver25
  );
  assert(lowCombinedOver25.score < 0, "low-scoring profile should have negative over tendency");

  const evenResult = buildFeatureScores({
    metadata: {
      homeTeam: "Balanced Home",
      awayTeam: "Balanced Away",
    },
  });
  const evenCombinedBtts = getFeatureById(
    evenResult.features,
    SCORING_PATTERN_FEATURE_IDS.combinedBtts
  );
  assertNear(evenCombinedBtts.score, 0, "balanced BTTS should be near zero");

  const conflictProvider: ScoringPatternProvider = {
    getScoringPattern() {
      return buildPartialScoringPatternSnapshot({
        home: {
          sampleSize: 12,
          over15Rate: 0.8,
          over25Rate: 0.62,
          over35Rate: 0.35,
          bttsRate: 0.74,
          cleanSheetRate: 0.58,
          failedToScoreRate: 0.12,
          averageTotalGoals: 2.7,
          firstHalfOver05Rate: 0.7,
          firstHalfOver15Rate: 0.35,
        },
        away: {
          sampleSize: 12,
          over15Rate: 0.78,
          over25Rate: 0.6,
          over35Rate: 0.32,
          bttsRate: 0.7,
          cleanSheetRate: 0.52,
          failedToScoreRate: 0.14,
          averageTotalGoals: 2.65,
          firstHalfOver05Rate: 0.68,
          firstHalfOver15Rate: 0.33,
        },
      });
    },
  };

  const conflictResult = buildFeatureScores({
    metadata: {
      homeTeam: "Conflict",
      awayTeam: "Conflict",
      scoringPatternProvider: conflictProvider,
    },
  });
  const conflictFeature = getFeatureById(
    conflictResult.features,
    SCORING_PATTERN_FEATURE_IDS.cleanSheetConflict
  );
  const conflictCombinedBtts = getFeatureById(
    conflictResult.features,
    SCORING_PATTERN_FEATURE_IDS.combinedBtts
  );
  assert(
    conflictFeature.confidence < conflictCombinedBtts.confidence,
    "clean sheet conflict should reduce confidence relative to BTTS feature in same snapshot"
  );
  assert(
    conflictFeature.reason.includes("不一致"),
    "conflict feature reason should mention signal mismatch"
  );

  const failScoreProvider: ScoringPatternProvider = {
    getScoringPattern() {
      return buildPartialScoringPatternSnapshot({
        home: {
          sampleSize: 10,
          over15Rate: 0.55,
          over25Rate: 0.35,
          over35Rate: 0.15,
          bttsRate: 0.3,
          cleanSheetRate: 0.35,
          failedToScoreRate: 0.52,
          averageTotalGoals: 2.0,
          firstHalfOver05Rate: 0.4,
          firstHalfOver15Rate: 0.18,
        },
        away: {
          sampleSize: 10,
          over15Rate: 0.52,
          over25Rate: 0.32,
          over35Rate: 0.12,
          bttsRate: 0.28,
          cleanSheetRate: 0.38,
          failedToScoreRate: 0.58,
          averageTotalGoals: 1.95,
          firstHalfOver05Rate: 0.38,
          firstHalfOver15Rate: 0.16,
        },
      });
    },
  };

  const failScoreResult = buildFeatureScores({
    metadata: {
      homeTeam: "Fail",
      awayTeam: "Fail",
      scoringPatternProvider: failScoreProvider,
    },
  });
  const failScoreFeature = getFeatureById(
    failScoreResult.features,
    SCORING_PATTERN_FEATURE_IDS.failedToScoreRisk
  );
  assert(
    failScoreFeature.score < 0,
    "high failed-to-score rate should produce negative score"
  );

  const smallSampleResult = buildFeatureScores({
    metadata: {
      homeTeam: "Mock Small Home",
      awayTeam: "Mock Small Away",
    },
  });
  for (const feature of getScoringPatternFeatures(smallSampleResult.features)) {
    assert(
      feature.confidence <= 0.35 + EPSILON,
      `${feature.id} with sampleSize < 5 must cap confidence at 0.35`
    );
  }

  const mediumSampleProvider: ScoringPatternProvider = {
    getScoringPattern() {
      return buildPartialScoringPatternSnapshot({
        home: {
          sampleSize: 7,
          over15Rate: 0.7,
          over25Rate: 0.55,
          over35Rate: 0.3,
          bttsRate: 0.58,
          cleanSheetRate: 0.22,
          failedToScoreRate: 0.2,
          averageTotalGoals: 2.6,
          firstHalfOver05Rate: 0.62,
          firstHalfOver15Rate: 0.28,
        },
        away: {
          sampleSize: 8,
          over15Rate: 0.72,
          over25Rate: 0.5,
          over35Rate: 0.24,
          bttsRate: 0.52,
          cleanSheetRate: 0.26,
          failedToScoreRate: 0.24,
          averageTotalGoals: 2.45,
          firstHalfOver05Rate: 0.58,
          firstHalfOver15Rate: 0.26,
        },
      });
    },
  };

  const mediumSampleResult = buildFeatureScores({
    metadata: {
      homeTeam: "Custom",
      awayTeam: "Custom",
      scoringPatternProvider: mediumSampleProvider,
    },
  });
  for (const feature of getScoringPatternFeatures(mediumSampleResult.features)) {
    assert(
      feature.confidence <= 0.65 + EPSILON,
      `${feature.id} with sampleSize 5-9 must cap confidence at 0.65`
    );
  }

  const partialProvider: ScoringPatternProvider = {
    getScoringPattern() {
      return buildPartialScoringPatternSnapshot({
        home: {
          sampleSize: 10,
          over15Rate: 0.8,
          over25Rate: 0.6,
          over35Rate: null,
          bttsRate: 0.65,
          cleanSheetRate: 0.2,
          failedToScoreRate: null,
          averageTotalGoals: 2.8,
          firstHalfOver05Rate: 0.72,
          firstHalfOver15Rate: null,
        },
        away: {
          sampleSize: 10,
          over15Rate: 0.75,
          over25Rate: 0.55,
          over35Rate: 0.3,
          bttsRate: 0.6,
          cleanSheetRate: 0.18,
          failedToScoreRate: 0.22,
          averageTotalGoals: 2.7,
          firstHalfOver05Rate: 0.68,
          firstHalfOver15Rate: 0.25,
        },
      });
    },
  };

  const partialResult = buildFeatureScores({
    metadata: {
      homeTeam: "Partial",
      awayTeam: "Partial",
      scoringPatternProvider: partialProvider,
    },
  });
  const partialFeatures = getScoringPatternFeatures(partialResult.features);
  assert(
    !partialFeatures.some(
      (feature) => feature.id === SCORING_PATTERN_FEATURE_IDS.combinedOver35
    ),
    "missing over35 data should omit Combined Over 3.5 feature"
  );
  assert(
    !partialFeatures.some(
      (feature) => feature.id === SCORING_PATTERN_FEATURE_IDS.failedToScoreRisk
    ),
    "missing failedToScoreRate should omit Failed To Score Risk feature"
  );
  assert(
    partialFeatures.some(
      (feature) => feature.id === SCORING_PATTERN_FEATURE_IDS.combinedOver25
    ),
    "partial data should still emit computable over 2.5 feature"
  );
  for (const feature of partialFeatures) {
    const metadata = getMetadata(feature);
    assert(
      metadata.homeValue === null || typeof metadata.homeValue === "number",
      "metadata must not coerce missing values to 0"
    );
  }

  const emptyResult = buildFeatureScores({
    metadata: {
      homeTeam: "Empty Home",
      awayTeam: "Empty Away",
    },
  });
  assert(
    getScoringPatternFeatures(emptyResult.features).length === 0,
    "empty data should produce no scoring pattern features"
  );

  assert(
    buildFeatureScores({}).features.length === 0,
    "missing team names should produce no scoring pattern features"
  );

  for (const feature of highFeatures) {
    assert(
      feature.weight === getFeatureWeight("scoringPattern"),
      `${feature.id} weight should use scoringPattern`
    );
  }

  assertBounds(highFeatures);
  assertBounds(getScoringPatternFeatures(lowScoringResult.features));
  assertBounds(getScoringPatternFeatures(partialResult.features));

  assert(
    MOCK_SCORING_PATTERN_FIXTURES.highScoringBttsYes.home.over25Rate === 0.78,
    "fixture over 2.5 rate"
  );

  for (const id of ALL_FEATURE_IDS) {
    assert(
      highFeatures.some((feature) => feature.id === id),
      `high scoring full snapshot should include ${id}`
    );
  }

  console.log("Scoring Pattern Feature tests passed.");
}

runTests();

export {};
