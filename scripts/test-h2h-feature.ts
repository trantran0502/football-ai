import {
  buildFeatureScores,
  FEATURE_WEIGHTS,
  getFeatureWeight,
  getRegisteredFeatureCollectors,
  H2H_FEATURE_IDS,
  registerH2HCollector,
  resetFeatureCollectorsForTests,
  resetH2HCollectorRegistrationForTests,
  resetH2HProviderForTests,
  isH2HCollectorRegistered,
  type H2HFeatureMetadata,
} from "@/lib/analysis/featureScore";
import {
  MOCK_H2H_FIXTURES,
  buildPartialH2HSnapshot,
  createMockH2HProvider,
  type H2HProvider,
} from "@/lib/analysis/featureScore/providers/h2hProvider";

const EPSILON = 1e-4;
const ALL_FEATURE_IDS = Object.values(H2H_FEATURE_IDS);

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

function getH2HFeatures(features: ReturnType<typeof buildFeatureScores>["features"]) {
  return features.filter((feature) => feature.id.startsWith("h2h."));
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
}): H2HFeatureMetadata {
  return feature.metadata as unknown as H2HFeatureMetadata;
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
      feature.confidence <= 0.65 + EPSILON,
      `${feature.id} H2H confidence must not exceed 0.65`
    );
  }
}

function runTests(): void {
  resetFeatureCollectorsForTests();
  resetH2HCollectorRegistrationForTests();
  resetH2HProviderForTests();

  assert(
    getFeatureWeight("h2h") < FEATURE_WEIGHTS.recentForm,
    "h2h weight must be lower than recentForm"
  );
  assert(
    getFeatureWeight("h2h") < FEATURE_WEIGHTS.homeAdvantage,
    "h2h weight must be lower than homeAdvantage"
  );
  assert(
    getFeatureWeight("h2h") < FEATURE_WEIGHTS.goalsXg,
    "h2h weight must be lower than goalsXg"
  );

  registerH2HCollector();
  assert(isH2HCollectorRegistered(), "collector should be registered");

  const collectorsAfterFirst = getRegisteredFeatureCollectors().length;
  registerH2HCollector();
  assert(
    getRegisteredFeatureCollectors().length === collectorsAfterFirst,
    "duplicate registerH2HCollector must not add another collector"
  );

  const homeDominantResult = buildFeatureScores({
    metadata: {
      homeTeam: "MockHome FC",
      awayTeam: "MockAway FC",
      matchDate: "2026-07-15",
    },
  });
  const homeDominantFeatures = getH2HFeatures(homeDominantResult.features);
  assert(homeDominantFeatures.length >= 8, "home dominant H2H should emit multiple features");

  const homeWinRate = getFeatureById(
    homeDominantResult.features,
    H2H_FEATURE_IDS.homeWinRate
  );
  assert(homeWinRate.score > 0, "home dominant H2H should score positive on home win rate");
  assert(
    MOCK_H2H_FIXTURES.homeDominant.sampleSize === 5,
    "home dominant fixture sample size"
  );

  const awayDominantResult = buildFeatureScores({
    metadata: {
      homeTeam: "Balanced Home",
      awayTeam: "Strong-Away FC",
      matchDate: "2026-07-15",
    },
  });
  const awayHomeWinRate = getFeatureById(
    awayDominantResult.features,
    H2H_FEATURE_IDS.homeWinRate
  );
  assert(
    awayHomeWinRate.score < homeWinRate.score,
    "away dominant H2H should score lower for current home team"
  );

  const balancedResult = buildFeatureScores({
    metadata: {
      homeTeam: "Balanced Home",
      awayTeam: "Balanced Away",
      matchDate: "2026-07-15",
    },
  });
  const balancedHomeWin = getFeatureById(
    balancedResult.features,
    H2H_FEATURE_IDS.homeWinRate
  );
  assertNear(balancedHomeWin.score, 0, "balanced H2H win rate should be near zero", 40);

  const smallSampleResult = buildFeatureScores({
    metadata: {
      homeTeam: "Small-Sample Home",
      awayTeam: "Small-Sample Away",
      matchDate: "2026-07-15",
    },
  });
  for (const feature of getH2HFeatures(smallSampleResult.features)) {
    assert(
      feature.confidence <= 0.3 + EPSILON,
      `${feature.id} with sampleSize < 3 must cap confidence at 0.3`
    );
  }

  const staleResult = buildFeatureScores({
    metadata: {
      homeTeam: "Stale Home",
      awayTeam: "Stale Away",
      matchDate: "2026-07-15",
    },
  });
  const staleHomeWin = getFeatureById(staleResult.features, H2H_FEATURE_IDS.homeWinRate);
  assert(
    staleHomeWin.confidence < homeWinRate.confidence,
    "H2H data older than 3 years should reduce confidence"
  );

  const neutralResult = buildFeatureScores({
    metadata: {
      homeTeam: "Neutral Home",
      awayTeam: "Neutral Away",
      matchDate: "2026-07-15",
    },
  });
  const venueFeature = getFeatureById(
    neutralResult.features,
    H2H_FEATURE_IDS.venueRelevant
  );
  const venueMeta = getMetadata(venueFeature);
  assert(
    (venueMeta.venueFilteredSampleSize ?? 0) < 5,
    "neutral venue matches must not count toward venue-relevant H2H sample"
  );

  const partialProvider: H2HProvider = {
    getH2HHistory() {
      return buildPartialH2HSnapshot({
        referenceDate: "2026-07-15",
        matches: [
          {
            matchDate: "2025-05-01",
            homeTeam: "Partial Home",
            awayTeam: "Partial Away",
            homeGoals: 2,
            awayGoals: 1,
            venue: "Partial Home Home",
            competition: "League",
            neutralVenue: false,
          },
          {
            matchDate: "2024-11-20",
            homeTeam: "Partial Away",
            awayTeam: "Partial Home",
            homeGoals: null,
            awayGoals: null,
            venue: "Partial Away Home",
            competition: "League",
            neutralVenue: false,
          },
          {
            matchDate: "2024-03-09",
            homeTeam: "Partial Home",
            awayTeam: "Partial Away",
            homeGoals: null,
            awayGoals: null,
            venue: "Partial Home Home",
            competition: "League",
            neutralVenue: false,
          },
        ],
      });
    },
  };

  const partialResult = buildFeatureScores({
    metadata: {
      homeTeam: "Partial Home",
      awayTeam: "Partial Away",
      matchDate: "2026-07-15",
      h2hProvider: partialProvider,
    },
  });
  const partialFeatures = getH2HFeatures(partialResult.features);
  assert(
    !partialFeatures.some((feature) => feature.id === H2H_FEATURE_IDS.recentMomentum),
    "single scored H2H match should omit Recent H2H Momentum"
  );
  assert(
    partialFeatures.length < ALL_FEATURE_IDS.length,
    "partial score history should emit fewer than full H2H feature set"
  );
  assert(
    partialFeatures.every((feature) => getMetadata(feature).sampleSize === 3),
    "partial snapshot sampleSize should reflect provider sample count"
  );

  const emptyResult = buildFeatureScores({
    metadata: {
      homeTeam: "Empty Home",
      awayTeam: "Empty Away",
      matchDate: "2026-07-15",
    },
  });
  assert(
    getH2HFeatures(emptyResult.features).length === 0,
    "empty H2H data should return empty feature array"
  );

  assert(
    buildFeatureScores({}).features.length === 0,
    "missing teams should return no H2H features"
  );

  for (const id of ALL_FEATURE_IDS) {
    assert(
      homeDominantFeatures.some((feature) => feature.id === id),
      `home dominant full H2H should include ${id}`
    );
  }

  for (const feature of homeDominantFeatures) {
    assert(
      feature.weight === getFeatureWeight("h2h"),
      `${feature.id} weight should use h2h`
    );
    assert(feature.reason.length > 0, `${feature.id} must include reason`);
  }

  assertBounds(homeDominantFeatures);
  assertBounds(getH2HFeatures(awayDominantResult.features));
  assertBounds(partialFeatures);

  console.log("H2H Feature tests passed.");
}

runTests();

export {};
