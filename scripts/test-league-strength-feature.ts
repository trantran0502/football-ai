import {
  buildFeatureScores,
  getFeatureWeight,
  getRegisteredFeatureCollectors,
  LEAGUE_STRENGTH_FEATURE_IDS,
  registerLeagueStrengthCollector,
  resetFeatureCollectorsForTests,
  resetLeagueStrengthCollectorRegistrationForTests,
  resetLeagueStrengthProviderForTests,
  isLeagueStrengthCollectorRegistered,
  type LeagueStrengthFeatureMetadata,
} from "@/lib/analysis/featureScore";
import {
  MOCK_LEAGUE_STRENGTH_FIXTURES,
  createMockLeagueStrengthProvider,
  type LeagueStrengthProvider,
} from "@/lib/analysis/featureScore/providers/leagueStrengthProvider";

const EPSILON = 1e-4;
const EXPECTED_FEATURE_IDS = Object.values(LEAGUE_STRENGTH_FEATURE_IDS);

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

function getLeagueStrengthFeatures(
  features: ReturnType<typeof buildFeatureScores>["features"]
) {
  return features.filter((feature) => feature.id.startsWith("league_strength."));
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
}): LeagueStrengthFeatureMetadata {
  return feature.metadata as unknown as LeagueStrengthFeatureMetadata;
}

function runTests(): void {
  resetFeatureCollectorsForTests();
  resetLeagueStrengthCollectorRegistrationForTests();
  resetLeagueStrengthProviderForTests();

  const mockProvider = createMockLeagueStrengthProvider();
  const elite = mockProvider.getLeagueStrength({ leagueName: "Mock Elite League" });
  const weak = mockProvider.getLeagueStrength({ leagueName: "Mock Weak League" });

  assert(elite.leagueName === "Mock Elite League", "elite league name");
  assert((elite.leagueRanking ?? 999) < (weak.leagueRanking ?? 0), "elite should rank higher");
  assert((elite.attackStrength ?? 0) > (weak.attackStrength ?? 0), "elite attack stronger");
  assert(
    MOCK_LEAGUE_STRENGTH_FIXTURES.elite.leagueTier === 1,
    "elite fixture tier should be 1"
  );

  registerLeagueStrengthCollector();
  assert(isLeagueStrengthCollectorRegistered(), "collector should be registered");

  const collectorsAfterFirst = getRegisteredFeatureCollectors().length;
  registerLeagueStrengthCollector();
  assert(
    getRegisteredFeatureCollectors().length === collectorsAfterFirst,
    "duplicate registerLeagueStrengthCollector must not add another collector"
  );

  const missingLeague = buildFeatureScores({});
  assert(
    getLeagueStrengthFeatures(missingLeague.features).length === 5,
    "missing league should still return 5 league strength features"
  );
  assert(
    getLeagueStrengthFeatures(missingLeague.features).every(
      (feature) => (feature.score ?? 0) === 0
    ),
    "missing league should score 0"
  );

  const result = buildFeatureScores({
    metadata: {
      leagueName: "Mock Elite League",
    },
  });

  const leagueFeatures = getLeagueStrengthFeatures(result.features);
  assert(leagueFeatures.length === 5, "should produce 5 league strength features");

  for (const expectedId of EXPECTED_FEATURE_IDS) {
    assert(
      leagueFeatures.some((feature) => feature.id === expectedId),
      `missing feature id ${expectedId}`
    );
  }

  const leagueRank = getFeatureById(
    result.features,
    LEAGUE_STRENGTH_FEATURE_IDS.leagueRank
  );
  const rankMeta = getMetadata(leagueRank);
  assert(rankMeta.label === "League Rank", "league rank label");
  assert(rankMeta.rawMetric === 3, "elite league rank should be 3");
  assert(leagueRank.score > 90, "top-ranked league should score high");

  const leagueTier = getFeatureById(
    result.features,
    LEAGUE_STRENGTH_FEATURE_IDS.leagueTier
  );
  assert(leagueTier.score === 100, "tier 1 league should score 100");

  const attackStrength = getFeatureById(
    result.features,
    LEAGUE_STRENGTH_FEATURE_IDS.attackStrength
  );
  assert(attackStrength.category === "totalGoals", "attack strength category");
  assertNear(attackStrength.score, 88, "elite attack strength score");

  const defenseStrength = getFeatureById(
    result.features,
    LEAGUE_STRENGTH_FEATURE_IDS.defenseStrength
  );
  assertNear(defenseStrength.score, 86, "elite defense strength score");

  const goalEnvironment = getFeatureById(
    result.features,
    LEAGUE_STRENGTH_FEATURE_IDS.goalEnvironment
  );
  assert(goalEnvironment.score > 0, "high-scoring elite league should have positive goal environment");

  const weakResult = buildFeatureScores({
    metadata: {
      league: "Mock Weak League",
    },
  });
  const weakRank = getFeatureById(
    weakResult.features,
    LEAGUE_STRENGTH_FEATURE_IDS.leagueRank
  );
  assert(weakRank.score < leagueRank.score, "weak league should rank lower in score");

  const customProvider: LeagueStrengthProvider = {
    getLeagueStrength() {
      return {
        leagueName: "Custom League",
        leagueRanking: null,
        leagueTier: 2,
        attackStrength: 0.6,
        defenseStrength: null,
        averageGoals: 2.4,
        averageGoalsConceded: null,
        sampleSize: 0,
        dataFreshnessDays: null,
      };
    },
  };

  const partial = buildFeatureScores({
    metadata: {
      leagueName: "Custom League",
      leagueStrengthProvider: customProvider,
    },
  });

  const partialRank = getFeatureById(
    partial.features,
    LEAGUE_STRENGTH_FEATURE_IDS.leagueRank
  );
  assert(partialRank.score === 0, "missing rank should score 0");
  assert(
    partialRank.confidence <= 0.5,
    "partial league data should reduce confidence"
  );

  for (const feature of leagueFeatures) {
    assert(
      feature.weight === getFeatureWeight("leagueStrength"),
      `${feature.id} weight should use leagueStrength`
    );
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

  console.log("League Strength Feature tests passed.");
}

runTests();

export {};
