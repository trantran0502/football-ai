import {
  buildFeatureScores,
  getFeatureWeight,
  getRegisteredFeatureCollectors,
  RECENT_FORM_FEATURE_IDS,
  registerRecentFormCollector,
  resetFeatureCollectorsForTests,
  resetRecentFormCollectorRegistrationForTests,
  resetRecentFormProviderForTests,
  isRecentFormCollectorRegistered,
  type RecentFormFeatureMetadata,
} from "@/lib/analysis/featureScore";
import {
  MOCK_RECENT_FORM_FIXTURES,
  createMockRecentFormProvider,
  type RecentFormProvider,
} from "@/lib/analysis/featureScore/providers/recentFormProvider";

const EPSILON = 1e-4;
const EXPECTED_FEATURE_IDS = Object.values(RECENT_FORM_FEATURE_IDS);

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

function getRecentFormFeatures(
  features: ReturnType<typeof buildFeatureScores>["features"]
) {
  return features.filter((feature) => feature.id.startsWith("recent_form."));
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
}): RecentFormFeatureMetadata {
  return feature.metadata as unknown as RecentFormFeatureMetadata;
}

function runTests(): void {
  resetFeatureCollectorsForTests();
  resetRecentFormCollectorRegistrationForTests();
  resetRecentFormProviderForTests();

  const mockProvider = createMockRecentFormProvider();
  const matchup = mockProvider.getRecentForm({
    homeTeam: "MockHome FC",
    awayTeam: "MockAway FC",
  });

  assert(matchup.home.teamName === "MockHome FC", "mock home team name");
  assert(matchup.away.teamName === "MockAway FC", "mock away team name");
  assert(
    (matchup.home.winRate ?? 0) > (matchup.away.winRate ?? 0),
    "MockHome FC should have higher win rate than MockAway FC"
  );
  assert(
    MOCK_RECENT_FORM_FIXTURES.strongHome.sampleSize === 10,
    "strong home fixture sample size should be 10"
  );

  registerRecentFormCollector();
  assert(isRecentFormCollectorRegistered(), "collector should be registered");

  const collectorsAfterFirst = getRegisteredFeatureCollectors().length;
  registerRecentFormCollector();
  assert(
    getRegisteredFeatureCollectors().length === collectorsAfterFirst,
    "duplicate registerRecentFormCollector must not add another collector"
  );

  const missingTeams = buildFeatureScores({});
  assert(
    getRecentFormFeatures(missingTeams.features).length === 9,
    "missing teams should still return 9 recent form features"
  );
  assert(
    getRecentFormFeatures(missingTeams.features).every(
      (feature) => (feature.score ?? 0) === 0
    ),
    "missing teams should score 0"
  );

  const result = buildFeatureScores({
    metadata: {
      homeTeam: "MockHome FC",
      awayTeam: "MockAway FC",
    },
  });

  const recentFormFeatures = getRecentFormFeatures(result.features);
  assert(recentFormFeatures.length === 9, "should produce 9 recent form features");

  for (const expectedId of EXPECTED_FEATURE_IDS) {
    assert(
      recentFormFeatures.some((feature) => feature.id === expectedId),
      `missing feature id ${expectedId}`
    );
  }

  const winRate = getFeatureById(result.features, RECENT_FORM_FEATURE_IDS.winRate);
  const winMeta = getMetadata(winRate);
  assert(winMeta.label === "Win Rate", "win rate label");
  assert((winMeta.differential ?? 0) > 0, "strong home should lead win rate differential");
  assert(winRate.score > 0, "strong home should have positive win rate score");
  assert(
    winRate.weight === getFeatureWeight("recentForm"),
    "win rate weight should use recentForm"
  );

  const goalDifference = getFeatureById(
    result.features,
    RECENT_FORM_FEATURE_IDS.goalDifference
  );
  assert(goalDifference.category === "totalGoals", "goal difference category");
  assert(goalDifference.score > 0, "strong home should lead goal difference score");

  const goalsScored = getFeatureById(
    result.features,
    RECENT_FORM_FEATURE_IDS.goalsScored
  );
  assert(goalsScored.score > 0, "strong home should score more goals");

  const goalsConceded = getFeatureById(
    result.features,
    RECENT_FORM_FEATURE_IDS.goalsConceded
  );
  assert(goalsConceded.score > 0, "strong home should concede fewer goals");

  const homeForm = getFeatureById(result.features, RECENT_FORM_FEATURE_IDS.homeForm);
  assert(homeForm.score > 0, "home form should favor MockHome FC");

  const awayForm = getFeatureById(result.features, RECENT_FORM_FEATURE_IDS.awayForm);
  assert(awayForm.score > 0, "away form should favor home when away is weak");

  const momentum = getFeatureById(result.features, RECENT_FORM_FEATURE_IDS.momentum);
  assert(momentum.score > 0, "momentum should favor strong home team");

  const cleanSheet = getFeatureById(
    result.features,
    RECENT_FORM_FEATURE_IDS.cleanSheetRate
  );
  assert(cleanSheet.score > 0, "clean sheet rate should favor strong home team");

  const failedToScore = getFeatureById(
    result.features,
    RECENT_FORM_FEATURE_IDS.failedToScoreRate
  );
  assert(
    failedToScore.score > 0,
    "failed to score rate should favor home when away fails more often"
  );

  const customProvider: RecentFormProvider = {
    getRecentForm() {
      return {
        home: {
          teamName: "Custom Home",
          sampleSize: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          winRate: null,
          avgGoalsFor: null,
          avgGoalsAgainst: null,
          goalDifferencePerMatch: null,
          venueWinRate: null,
          momentum: null,
          cleanSheetRate: null,
          failedToScoreRate: null,
        },
        away: MOCK_RECENT_FORM_FIXTURES.weakAway,
      };
    },
  };

  const incomplete = buildFeatureScores({
    metadata: {
      homeTeam: "Custom Home",
      awayTeam: "MockAway FC",
      recentFormProvider: customProvider,
    },
  });

  const incompleteWinRate = getFeatureById(
    incomplete.features,
    RECENT_FORM_FEATURE_IDS.winRate
  );
  assert(incompleteWinRate.score === 0, "incomplete sample should score 0");
  assert(
    incompleteWinRate.confidence <= 0.35,
    "incomplete sample should have low confidence"
  );

  for (const feature of recentFormFeatures) {
    assert(
      (feature.score ?? 0) >= -100 && (feature.score ?? 0) <= 100,
      `${feature.id} score must stay within [-100, 100]`
    );
    assert(
      feature.confidence >= 0 && feature.confidence <= 1,
      `${feature.id} confidence must stay within [0, 1]`
    );
    assert(feature.reason.length > 0, `${feature.id} must include reason`);
  }

  assert(result.totalScore > 0, "aggregate totalScore should favor strong home team");
  assertNear(
    result.confidence,
    recentFormFeatures.reduce((sum, feature) => sum + feature.confidence, 0) / 9,
    "aggregate confidence should match feature average"
  );

  console.log("Recent Form Feature tests passed.");
}

runTests();

export {};
