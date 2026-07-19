import {
  buildFeatureScores,
  getFeatureWeight,
  getRegisteredFeatureCollectors,
  GOALS_XG_FEATURE_IDS,
  registerGoalsXgCollector,
  resetFeatureCollectorsForTests,
  resetGoalsXgCollectorRegistrationForTests,
  resetGoalsXgProviderForTests,
  isGoalsXgCollectorRegistered,
  type GoalsXgFeatureMetadata,
} from "@/lib/analysis/featureScore";
import {
  MOCK_GOALS_XG_FIXTURES,
  buildPartialGoalsXgSnapshot,
  createMockGoalsXgProvider,
  type GoalsXgProvider,
} from "@/lib/analysis/featureScore/providers/goalsXgProvider";

const EPSILON = 1e-4;
const EXPECTED_FEATURE_IDS = Object.values(GOALS_XG_FEATURE_IDS);

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

function getGoalsXgFeatures(features: ReturnType<typeof buildFeatureScores>["features"]) {
  return features.filter((feature) => feature.id.startsWith("goals_xg."));
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
}): GoalsXgFeatureMetadata {
  return feature.metadata as unknown as GoalsXgFeatureMetadata;
}

function assertBounds(
  features: ReturnType<typeof buildFeatureScores>["features"]
): void {
  for (const feature of features) {
    assert(
      (feature.score ?? 0) >= -100 && (feature.score ?? 0) <= 100,
      `${feature.id} score must stay within [-100, 100]`
    );
    assert(
      feature.confidence >= 0 && feature.confidence <= 1,
      `${feature.id} confidence must stay within [0, 1]`
    );
  }
}

function runTests(): void {
  resetFeatureCollectorsForTests();
  resetGoalsXgCollectorRegistrationForTests();
  resetGoalsXgProviderForTests();

  const mockProvider = createMockGoalsXgProvider();
  const strongVsWeak = mockProvider.getGoalsXgMetrics({
    homeTeam: "MockHome FC",
    awayTeam: "MockAway FC",
  });
  assert(
    (strongVsWeak.home.averageGoalsFor ?? 0) > (strongVsWeak.away.averageGoalsFor ?? 0),
    "mock strong home should score more goals"
  );
  assert(
    MOCK_GOALS_XG_FIXTURES.strongHomeVsWeakAway.home.xG === 2.1,
    "fixture home xG"
  );

  registerGoalsXgCollector();
  assert(isGoalsXgCollectorRegistered(), "collector should be registered");

  const collectorsAfterFirst = getRegisteredFeatureCollectors().length;
  registerGoalsXgCollector();
  assert(
    getRegisteredFeatureCollectors().length === collectorsAfterFirst,
    "duplicate registerGoalsXgCollector must not add another collector"
  );

  const strongHomeResult = buildFeatureScores({
    metadata: {
      homeTeam: "MockHome FC",
      awayTeam: "MockAway FC",
    },
  });
  const strongFeatures = getGoalsXgFeatures(strongHomeResult.features);
  assert(strongFeatures.length === 12, "should produce 12 goals/xg features");

  for (const expectedId of EXPECTED_FEATURE_IDS) {
    assert(
      strongFeatures.some((feature) => feature.id === expectedId),
      `missing feature id ${expectedId}`
    );
  }

  const homeScoring = getFeatureById(
    strongHomeResult.features,
    GOALS_XG_FEATURE_IDS.homeScoring
  );
  assert(homeScoring.score > 0, "strong home attack should score positive on Home Scoring");
  assert(getMetadata(homeScoring).dataComplete, "home scoring should be complete");

  const expectedGoalAdvantage = getFeatureById(
    strongHomeResult.features,
    GOALS_XG_FEATURE_IDS.expectedGoalAdvantage
  );
  assert(
    expectedGoalAdvantage.score > 0,
    "strong home xG balance should produce positive Expected Goal Advantage"
  );

  const strongAwayResult = buildFeatureScores({
    metadata: {
      homeTeam: "MockAway FC",
      awayTeam: "MockHome FC",
    },
  });
  const strongAwayScoring = getFeatureById(
    strongAwayResult.features,
    GOALS_XG_FEATURE_IDS.homeScoring
  );
  assert(
    strongAwayScoring.score < homeScoring.score,
    "when home is weak and away is strong, home scoring feature should be lower"
  );

  const evenResult = buildFeatureScores({
    metadata: {
      homeTeam: "Balanced Home",
      awayTeam: "Balanced Away",
    },
  });
  const evenHomeScoring = getFeatureById(
    evenResult.features,
    GOALS_XG_FEATURE_IDS.homeScoring
  );
  assertNear(evenHomeScoring.score, 0, "balanced teams should have near-zero home scoring score");

  const noXgProvider: GoalsXgProvider = {
    getGoalsXgMetrics() {
      return buildPartialGoalsXgSnapshot({
        home: {
          averageGoalsFor: 2.2,
          averageGoalsAgainst: 1.0,
          xG: null,
          xGA: null,
          shots: 14,
          shotsOnTarget: 5.5,
          conversionRate: 0.15,
          shotAccuracy: 0.39,
        },
        away: {
          averageGoalsFor: 1.0,
          averageGoalsAgainst: 1.8,
          xG: null,
          xGA: null,
          shots: 9,
          shotsOnTarget: 3.1,
          conversionRate: 0.12,
          shotAccuracy: 0.34,
        },
      });
    },
  };

  const noXgResult = buildFeatureScores({
    metadata: {
      homeTeam: "Custom Home",
      awayTeam: "Custom Away",
      goalsXgProvider: noXgProvider,
    },
  });

  const noXgHome = getFeatureById(noXgResult.features, GOALS_XG_FEATURE_IDS.homeXg);
  assert(noXgHome.score === 0, "missing xG should not invent score");
  assert(noXgHome.confidence <= 0.25, "missing xG should lower confidence");
  assert(getMetadata(noXgHome).homeValue === null, "missing xG metadata must stay null");

  const noXgHomeScoring = getFeatureById(
    noXgResult.features,
    GOALS_XG_FEATURE_IDS.homeScoring
  );
  assert(noXgHomeScoring.score > 0, "goals data should still power Home Scoring without xG");
  assert(
    noXgHomeScoring.confidence > noXgHome.confidence,
    "goal-based features should retain higher confidence than xG features when xG missing"
  );

  const noShotsProvider: GoalsXgProvider = {
    getGoalsXgMetrics() {
      return buildPartialGoalsXgSnapshot({
        home: {
          averageGoalsFor: 2.0,
          averageGoalsAgainst: 1.1,
          xG: 1.9,
          xGA: 1.0,
          shots: null,
          shotsOnTarget: null,
          conversionRate: null,
          shotAccuracy: null,
        },
        away: {
          averageGoalsFor: 1.2,
          averageGoalsAgainst: 1.7,
          xG: 1.1,
          xGA: 1.6,
          shots: null,
          shotsOnTarget: null,
          conversionRate: null,
          shotAccuracy: null,
        },
      });
    },
  };

  const noShotsResult = buildFeatureScores({
    metadata: {
      homeTeam: "Custom Home",
      awayTeam: "Custom Away",
      goalsXgProvider: noShotsProvider,
    },
  });

  const shotVolume = getFeatureById(
    noShotsResult.features,
    GOALS_XG_FEATURE_IDS.shotVolume
  );
  assert(shotVolume.score === 0, "missing shot data should not invent shot volume score");
  assert(getMetadata(shotVolume).homeValue === null, "shot volume homeValue must remain null");

  const noShotsHomeXg = getFeatureById(
    noShotsResult.features,
    GOALS_XG_FEATURE_IDS.homeXg
  );
  assert(noShotsHomeXg.score > 0, "xG features should still work without shot data");

  const emptyProvider: GoalsXgProvider = {
    getGoalsXgMetrics() {
      return MOCK_GOALS_XG_FIXTURES.empty;
    },
  };

  const emptyResult = buildFeatureScores({
    metadata: {
      homeTeam: "Empty Home",
      awayTeam: "Empty Away",
      goalsXgProvider: emptyProvider,
    },
  });
  const emptyFeatures = getGoalsXgFeatures(emptyResult.features);
  assert(
    emptyFeatures.every((feature) => (feature.score ?? 0) === 0),
    "empty data should score 0 for all goals/xg features"
  );
  assert(
    emptyFeatures.every((feature) => feature.confidence <= 0.25),
    "empty data should use low confidence"
  );

  const missingTeams = buildFeatureScores({});
  assert(
    getGoalsXgFeatures(missingTeams.features).length === 12,
    "missing teams should still return 12 incomplete features"
  );

  for (const feature of strongFeatures) {
    assert(
      feature.weight === getFeatureWeight("goalsXg"),
      `${feature.id} weight should use goalsXg`
    );
    assert(feature.reason.length > 0, `${feature.id} must include reason`);
  }

  assertBounds(strongFeatures);
  assertBounds(getGoalsXgFeatures(noXgResult.features));
  assertBounds(getGoalsXgFeatures(noShotsResult.features));
  assertBounds(emptyFeatures);

  const noXgMockResult = buildFeatureScores({
    metadata: {
      homeTeam: "Mock No XG Home",
      awayTeam: "MockAway FC",
    },
  });
  const mockNoXgFeature = getFeatureById(
    noXgMockResult.features,
    GOALS_XG_FEATURE_IDS.homeXg
  );
  assert(mockNoXgFeature.score === 0, "mock no-xg home preset should leave home xG incomplete");
  const mockNoXgScoring = getFeatureById(
    noXgMockResult.features,
    GOALS_XG_FEATURE_IDS.homeScoring
  );
  assert(mockNoXgScoring.score > 0, "mock no-xg preset should still score from goals");

  console.log("Goals / xG Feature tests passed.");
}

runTests();

export {};
