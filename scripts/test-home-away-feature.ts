import {
  buildFeatureScores,
  getFeatureWeight,
  getRegisteredFeatureCollectors,
  HOME_AWAY_FEATURE_IDS,
  registerHomeAwayCollector,
  resetFeatureCollectorsForTests,
  resetHomeAwayCollectorRegistrationForTests,
  resetHomeAwayProviderForTests,
  isHomeAwayCollectorRegistered,
  type HomeAwayFeatureMetadata,
} from "@/lib/analysis/featureScore";
import {
  MOCK_HOME_AWAY_FIXTURES,
  createMockHomeAwayProvider,
  type HomeAwayProvider,
} from "@/lib/analysis/featureScore/providers/homeAwayProvider";

const EPSILON = 1e-4;
const EXPECTED_FEATURE_IDS = Object.values(HOME_AWAY_FEATURE_IDS);

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

function getHomeAwayFeatures(
  features: ReturnType<typeof buildFeatureScores>["features"]
) {
  return features.filter((feature) => feature.id.startsWith("home_away."));
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
}): HomeAwayFeatureMetadata {
  return feature.metadata as unknown as HomeAwayFeatureMetadata;
}

function runTests(): void {
  resetFeatureCollectorsForTests();
  resetHomeAwayCollectorRegistrationForTests();
  resetHomeAwayProviderForTests();

  const mockProvider = createMockHomeAwayProvider();
  const snapshot = mockProvider.getHomeAwayStrength({
    homeTeam: "MockHome FC",
    awayTeam: "MockAway FC",
  });

  assert(snapshot.homeLast5.length === 5, "homeLast5 should contain 5 results");
  assert(snapshot.awayLast5.length === 5, "awayLast5 should contain 5 results");
  assert((snapshot.homeWinRate ?? 0) > (snapshot.awayWinRate ?? 0), "home win rate should exceed away");
  assert(
    MOCK_HOME_AWAY_FIXTURES.strongHomeVsWeakAway.homeGoalsFor === 2.1,
    "strong home goals for fixture"
  );

  registerHomeAwayCollector();
  assert(isHomeAwayCollectorRegistered(), "collector should be registered");

  const collectorsAfterFirst = getRegisteredFeatureCollectors().length;
  registerHomeAwayCollector();
  assert(
    getRegisteredFeatureCollectors().length === collectorsAfterFirst,
    "duplicate registerHomeAwayCollector must not add another collector"
  );

  const missingTeams = buildFeatureScores({});
  assert(
    getHomeAwayFeatures(missingTeams.features).length === 9,
    "missing teams should still return 9 home/away features"
  );
  assert(
    getHomeAwayFeatures(missingTeams.features).every((feature) => feature.score === 0),
    "missing teams should score 0"
  );

  const result = buildFeatureScores({
    metadata: {
      homeTeam: "MockHome FC",
      awayTeam: "MockAway FC",
    },
  });

  const homeAwayFeatures = getHomeAwayFeatures(result.features);
  assert(homeAwayFeatures.length === 9, "should produce 9 home/away features");

  for (const expectedId of EXPECTED_FEATURE_IDS) {
    assert(
      homeAwayFeatures.some((feature) => feature.id === expectedId),
      `missing feature id ${expectedId}`
    );
  }

  const homeWinRate = getFeatureById(result.features, HOME_AWAY_FEATURE_IDS.homeWinRate);
  const homeWinMeta = getMetadata(homeWinRate);
  assert(homeWinMeta.label === "Home Win Rate", "home win rate label");
  assert(homeWinMeta.homeLast5.length === 5, "metadata should include homeLast5");
  assert(homeWinRate.score > 0, "strong home team should have positive home win rate score");

  const awayWinRate = getFeatureById(result.features, HOME_AWAY_FEATURE_IDS.awayWinRate);
  assert(awayWinRate.score > 0, "weak away team should boost home-side away win rate score");

  const homeAttack = getFeatureById(result.features, HOME_AWAY_FEATURE_IDS.homeAttack);
  assert(homeAttack.score > 0, "strong home attack should score positive");

  const awayAttack = getFeatureById(result.features, HOME_AWAY_FEATURE_IDS.awayAttack);
  assert(awayAttack.score > 0, "weak away attack should score positive for home");

  const homeDefense = getFeatureById(result.features, HOME_AWAY_FEATURE_IDS.homeDefense);
  assert(homeDefense.score > 0, "strong home defense should score positive");

  const awayDefense = getFeatureById(result.features, HOME_AWAY_FEATURE_IDS.awayDefense);
  assert(awayDefense.score > 0, "leaky away defense should score positive for home");

  const homeCleanSheet = getFeatureById(
    result.features,
    HOME_AWAY_FEATURE_IDS.homeCleanSheet
  );
  assert(homeCleanSheet.score > 0, "high home clean sheet rate should score positive");

  const awayCleanSheet = getFeatureById(
    result.features,
    HOME_AWAY_FEATURE_IDS.awayCleanSheet
  );
  assert(awayCleanSheet.score > 0, "low away clean sheet rate should score positive for home");

  const homeAdvantage = getFeatureById(
    result.features,
    HOME_AWAY_FEATURE_IDS.homeAdvantage
  );
  assert(homeAdvantage.score > 0, "home advantage composite should favor strong home team");
  assert(
    (getMetadata(homeAdvantage).comparisonValue ?? 0) > 0,
    "home advantage comparison should reflect positive win-rate differential"
  );

  const customProvider: HomeAwayProvider = {
    getHomeAwayStrength() {
      return {
        homeLast5: ["D", "D", "D", "D", "D"],
        awayLast5: ["W", "W", "W", "W", "W"],
        homeWinRate: null,
        awayWinRate: 0.8,
        homeGoalsFor: 1.5,
        awayGoalsFor: 2.0,
        homeGoalsAgainst: null,
        awayGoalsAgainst: 1.0,
        homeCleanSheetRate: 0.2,
        awayCleanSheetRate: null,
      };
    },
  };

  const partial = buildFeatureScores({
    metadata: {
      homeTeam: "Custom Home",
      awayTeam: "Custom Away",
      homeAwayProvider: customProvider,
    },
  });

  const partialHomeWin = getFeatureById(
    partial.features,
    HOME_AWAY_FEATURE_IDS.homeWinRate
  );
  assert(partialHomeWin.score === 0, "missing home win rate should score 0");
  assert(
    partialHomeWin.confidence <= 0.5,
    "partial home/away data should reduce confidence"
  );

  for (const feature of homeAwayFeatures) {
    assert(
      feature.weight === getFeatureWeight("homeAdvantage"),
      `${feature.id} weight should use homeAdvantage`
    );
    assert(
      feature.score >= -100 && feature.score <= 100,
      `${feature.id} score must stay within [-100, 100]`
    );
    assert(
      feature.confidence >= 0 && feature.confidence <= 1,
      `${feature.id} confidence must stay within [0, 1]`
    );
    assert(feature.reason.length > 0, `${feature.id} must include reason`);
  }

  assert(result.totalScore > 0, "aggregate totalScore should favor strong home team");

  console.log("Home / Away Strength Feature tests passed.");
}

runTests();

export {};
