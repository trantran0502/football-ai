import {
  buildFeatureScores,
  getFeatureWeight,
  getRegisteredFeatureCollectors,
  MATCH_CONTEXT_FEATURE_IDS,
  registerMatchContextCollector,
  resetFeatureCollectorsForTests,
  resetMatchContextCollectorRegistrationForTests,
  resetMatchContextProviderForTests,
  isMatchContextCollectorRegistered,
} from "@/lib/analysis/featureScore";
import {
  MOCK_MATCH_CONTEXT_FIXTURES,
  buildPartialMatchContextSnapshot,
  createMockMatchContextProvider,
  type MatchContextProvider,
} from "@/lib/analysis/featureScore/providers/matchContextProvider";

const EPSILON = 1e-4;
const ALL_FEATURE_IDS = Object.values(MATCH_CONTEXT_FEATURE_IDS);
const AUXILIARY_MAX = 0.45;

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

function getMatchContextFeatures(
  features: ReturnType<typeof buildFeatureScores>["features"]
) {
  return features.filter((feature) => feature.id.startsWith("match_context."));
}

function getFeatureById(
  features: ReturnType<typeof buildFeatureScores>["features"],
  id: string
) {
  const feature = features.find((item) => item.id === id);
  assert(Boolean(feature), `feature ${id} should exist`);
  return feature!;
}

function assertBounds(features: ReturnType<typeof buildFeatureScores>["features"]): void {
  for (const feature of features) {
    assert(
      (feature.score ?? 0) >= -100 && (feature.score ?? 0) <= 100,
      `${feature.id} score must stay within [-100, 100]`
    );
    assert(
      feature.confidence >= 0 && feature.confidence <= 1,
      `${feature.id} confidence must stay within [0, 1]`
    );
    assert(
      !feature.reason.includes("下注") &&
        !feature.reason.includes("推薦") &&
        !feature.reason.toLowerCase().includes("bet"),
      `${feature.id} must not include betting recommendation language`
    );
  }
}

function runTests(): void {
  resetFeatureCollectorsForTests();
  resetMatchContextCollectorRegistrationForTests();
  resetMatchContextProviderForTests();

  registerMatchContextCollector();
  assert(isMatchContextCollectorRegistered(), "collector should be registered");

  const collectorsAfterFirst = getRegisteredFeatureCollectors().length;
  registerMatchContextCollector();
  assert(
    getRegisteredFeatureCollectors().length === collectorsAfterFirst,
    "duplicate registerMatchContextCollector must not add another collector"
  );

  const normalResult = buildFeatureScores({
    metadata: {
      homeTeam: "MockHome FC",
      awayTeam: "MockAway FC",
    },
  });
  const normalFeatures = getMatchContextFeatures(normalResult.features);
  assert(normalFeatures.length >= 10, "normal match context should emit many features");

  const congestedResult = buildFeatureScores({
    metadata: {
      homeTeam: "Congested Home",
      awayTeam: "Rested Away",
    },
  });
  const congestion = getFeatureById(
    congestedResult.features,
    MATCH_CONTEXT_FEATURE_IDS.fixtureCongestion
  );
  assert(congestion.score < 0, "congested home schedule should reduce home-side congestion score");

  const restedResult = buildFeatureScores({
    metadata: {
      homeTeam: "Long-Rest Home",
      awayTeam: "Congested Away",
    },
  });
  const rest = getFeatureById(
    restedResult.features,
    MATCH_CONTEXT_FEATURE_IDS.restAdvantage
  );
  assert(rest.score > 0, "longer home rest should produce positive rest advantage");

  const travelResult = buildFeatureScores({
    metadata: {
      homeTeam: "MockHome FC",
      awayTeam: "Long-Travel Away",
    },
  });
  const travel = getFeatureById(
    travelResult.features,
    MATCH_CONTEXT_FEATURE_IDS.travelFatigue
  );
  assert(travel.score > 20, "long away travel should favor home on travel fatigue feature");

  const neutralResult = buildFeatureScores({
    metadata: {
      homeTeam: "Neutral Derby Home",
      awayTeam: "Neutral Derby Away",
    },
  });
  const neutral = getFeatureById(
    neutralResult.features,
    MATCH_CONTEXT_FEATURE_IDS.neutralVenue
  );
  assert(neutral.score < 0, "neutral venue should cancel home advantage");

  const mustWinResult = buildFeatureScores({
    metadata: {
      homeTeam: "Must-Win Home",
      awayTeam: "MockAway FC",
    },
  });
  const mustWin = getFeatureById(
    mustWinResult.features,
    MATCH_CONTEXT_FEATURE_IDS.mustWinPressure
  );
  assert(mustWin.score > 0, "home must-win should increase must-win pressure score");

  const qualifiedResult = buildFeatureScores({
    metadata: {
      homeTeam: "Qualified Home",
      awayTeam: "MockAway FC",
    },
  });
  const qualification = getFeatureById(
    qualifiedResult.features,
    MATCH_CONTEXT_FEATURE_IDS.qualificationMotivation
  );
  assert(
    qualification.score < 0,
    "already qualified home team should reduce motivation score"
  );

  const eliminatedResult = buildFeatureScores({
    metadata: {
      homeTeam: "Eliminated Home",
      awayTeam: "MockAway FC",
    },
  });
  const eliminated = getFeatureById(
    eliminatedResult.features,
    MATCH_CONTEXT_FEATURE_IDS.qualificationMotivation
  );
  assert(eliminated.score < 0, "eliminated home team should reduce motivation score");

  const derbyResult = buildFeatureScores({
    metadata: {
      homeTeam: "Derby Home",
      awayTeam: "Derby Away",
    },
  });
  const derby = getFeatureById(
    derbyResult.features,
    MATCH_CONTEXT_FEATURE_IDS.derbyMotivation
  );
  assert(derby.score > 0, "derby match should increase derby motivation score");

  const extremeWeatherResult = buildFeatureScores({
    metadata: {
      homeTeam: "Extreme-Weather Home",
      awayTeam: "Extreme-Weather Away",
    },
  });
  const weather = getFeatureById(
    extremeWeatherResult.features,
    MATCH_CONTEXT_FEATURE_IDS.weatherImpact
  );
  const heat = getFeatureById(
    extremeWeatherResult.features,
    MATCH_CONTEXT_FEATURE_IDS.heatImpact
  );
  assert(
    weather.confidence <= AUXILIARY_MAX + EPSILON,
    "weather impact must stay auxiliary confidence"
  );
  assert(
    Math.abs(weather.score) <= 20,
    "weather impact must not dominate with large score"
  );
  assert(heat.confidence <= AUXILIARY_MAX + EPSILON, "heat impact must stay auxiliary confidence");

  const altitudeResult = buildFeatureScores({
    metadata: {
      homeTeam: "High-Alt Home",
      awayTeam: "High-Alt Away",
    },
  });
  const altitude = getFeatureById(
    altitudeResult.features,
    MATCH_CONTEXT_FEATURE_IDS.altitudeImpact
  );
  assert(altitude.score > 0, "high altitude should produce positive altitude impact score");
  assert(
    altitude.confidence <= AUXILIARY_MAX + EPSILON,
    "altitude impact must stay auxiliary confidence"
  );

  const emptyResult = buildFeatureScores({
    metadata: {
      homeTeam: "Empty Home",
      awayTeam: "Empty Away",
    },
  });
  assert(
    getMatchContextFeatures(emptyResult.features).length === 0,
    "empty match context should return empty feature array"
  );

  assert(buildFeatureScores({}).features.length === 0, "missing teams should return no features");

  for (const id of ALL_FEATURE_IDS) {
    assert(
      normalFeatures.some((feature) => feature.id === id),
      `normal match context should include ${id}`
    );
  }

  for (const feature of normalFeatures) {
    assert(
      feature.weight === getFeatureWeight("matchContext"),
      `${feature.id} weight should use matchContext`
    );
  }

  assert(
    getFeatureWeight("matchContext") < getFeatureWeight("recentForm"),
    "match context weight should remain below recent form"
  );

  assertBounds(normalFeatures);
  assertBounds(getMatchContextFeatures(travelResult.features));
  assertBounds(getMatchContextFeatures(extremeWeatherResult.features));

  assert(
    MOCK_MATCH_CONTEXT_FIXTURES.empty.home.daysSinceLastMatch === null,
    "empty fixture should have null team context"
  );

  console.log("Match Context Feature tests passed.");
}

runTests();

export {};
