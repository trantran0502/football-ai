import {
  buildFeatureScores,
  getFeatureWeight,
  getRegisteredFeatureCollectors,
  SQUAD_AVAILABILITY_FEATURE_IDS,
  registerSquadAvailabilityCollector,
  resetFeatureCollectorsForTests,
  resetSquadAvailabilityCollectorRegistrationForTests,
  resetSquadAvailabilityProviderForTests,
  isSquadAvailabilityCollectorRegistered,
} from "@/lib/analysis/featureScore";
import {
  MOCK_SQUAD_AVAILABILITY_FIXTURES,
  buildPartialSquadAvailabilitySnapshot,
  createMockSquadAvailabilityProvider,
  type SquadAvailabilityProvider,
} from "@/lib/analysis/featureScore/providers/squadAvailabilityProvider";

const EPSILON = 1e-4;
const ALL_FEATURE_IDS = Object.values(SQUAD_AVAILABILITY_FEATURE_IDS);

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function getSquadFeatures(features: ReturnType<typeof buildFeatureScores>["features"]) {
  return features.filter((feature) => feature.id.startsWith("squad_availability."));
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
        !feature.reason.toLowerCase().includes("bet") &&
        !feature.reason.includes("推薦"),
      `${feature.id} must not include betting recommendation language`
    );
  }
}

function runTests(): void {
  resetFeatureCollectorsForTests();
  resetSquadAvailabilityCollectorRegistrationForTests();
  resetSquadAvailabilityProviderForTests();

  registerSquadAvailabilityCollector();
  assert(isSquadAvailabilityCollectorRegistered(), "collector should be registered");

  const collectorsAfterFirst = getRegisteredFeatureCollectors().length;
  registerSquadAvailabilityCollector();
  assert(
    getRegisteredFeatureCollectors().length === collectorsAfterFirst,
    "duplicate registerSquadAvailabilityCollector must not add another collector"
  );

  const noInjuryResult = buildFeatureScores({
    metadata: {
      homeTeam: "No-Injury Home",
      awayTeam: "No-Injury Away",
    },
  });
  const noInjuryFeatures = getSquadFeatures(noInjuryResult.features);
  assert(noInjuryFeatures.length >= 10, "clean squads should emit squad availability features");

  const injuryImpact = getFeatureById(
    noInjuryResult.features,
    SQUAD_AVAILABILITY_FEATURE_IDS.injuryImpact
  );
  assertNear(injuryImpact.score, 0, "clean squads should have neutral injury impact");

  const homeCleanAwayDepleted = buildFeatureScores({
    metadata: {
      homeTeam: "MockHome FC",
      awayTeam: "MockAway FC",
    },
  });
  const depletedImpact = getFeatureById(
    homeCleanAwayDepleted.features,
    SQUAD_AVAILABILITY_FEATURE_IDS.injuryImpact
  );
  assert(depletedImpact.score > 0, "depleted away squad should favor home on injury impact");

  const singleOutResult = buildFeatureScores({
    metadata: {
      homeTeam: "Single-Out Home",
      awayTeam: "No-Injury Away",
    },
  });
  const singleXi = getFeatureById(
    singleOutResult.features,
    SQUAD_AVAILABILITY_FEATURE_IDS.missingStartingXi
  );
  assert(singleXi.score < 0, "single home starter out should reduce home-side availability score");

  const multiOutResult = buildFeatureScores({
    metadata: {
      homeTeam: "Multi-Out Home",
      awayTeam: "Multi-Out Away",
    },
  });
  const multiDefense = getFeatureById(
    multiOutResult.features,
    SQUAD_AVAILABILITY_FEATURE_IDS.defenseAvailability
  );
  assertNear(multiDefense.score, 0, "symmetric multi-out defense should be near neutral", 20);

  const gkOutResult = buildFeatureScores({
    metadata: {
      homeTeam: "GK-Out Home",
      awayTeam: "No-Injury Away",
    },
  });
  const gkFeature = getFeatureById(
    gkOutResult.features,
    SQUAD_AVAILABILITY_FEATURE_IDS.goalkeeperAvailability
  );
  const gkMissingXi = getFeatureById(
    gkOutResult.features,
    SQUAD_AVAILABILITY_FEATURE_IDS.missingStartingXi
  );
  assert(gkFeature.score <= -70, "home goalkeeper absence should heavily penalize home");
  assert(
    Math.abs(gkFeature.score) > Math.abs(gkMissingXi.score),
    "goalkeeper absence should outweigh a single missing starter"
  );

  const highRotationResult = buildFeatureScores({
    metadata: {
      homeTeam: "High-Rotation Home",
      awayTeam: "High-Rotation Away",
    },
  });
  const rotationFeature = getFeatureById(
    highRotationResult.features,
    SQUAD_AVAILABILITY_FEATURE_IDS.rotationRisk
  );
  const cleanRotation = getFeatureById(
    noInjuryResult.features,
    SQUAD_AVAILABILITY_FEATURE_IDS.rotationRisk
  );
  assert(
    rotationFeature.confidence < cleanRotation.confidence,
    "high rotation expectation should lower confidence"
  );

  const longRestResult = buildFeatureScores({
    metadata: {
      homeTeam: "Long-Rest Home",
      awayTeam: "Congested Away",
    },
  });
  const restFeature = getFeatureById(
    longRestResult.features,
    SQUAD_AVAILABILITY_FEATURE_IDS.restAdvantage
  );
  assert(restFeature.score > 0, "longer rest for home should produce positive rest advantage");

  const fatigueResult = buildFeatureScores({
    metadata: {
      homeTeam: "Congested Home",
      awayTeam: "Long-Rest Away",
    },
  });
  const fatigueFeature = getFeatureById(
    fatigueResult.features,
    SQUAD_AVAILABILITY_FEATURE_IDS.fatigueRisk
  );
  assert(fatigueFeature.score < 0, "congested home schedule should increase home fatigue risk");

  const partialProvider: SquadAvailabilityProvider = {
    getSquadAvailability() {
      return buildPartialSquadAvailabilitySnapshot({
        home: {
          injuries: 2,
          suspensions: null,
          doubtfulPlayers: null,
          expectedRotationCount: 3,
          missingStartingXI: 2,
          missingAttackers: 1,
          missingMidfielders: null,
          missingDefenders: 1,
          missingGoalkeeper: 0,
          squadDepthScore: 0.58,
          daysSinceLastMatch: 5,
          daysUntilNextMatch: null,
        },
        away: {
          injuries: 0,
          suspensions: 0,
          doubtfulPlayers: 0,
          expectedRotationCount: 1,
          missingStartingXI: 0,
          missingAttackers: 0,
          missingMidfielders: 0,
          missingDefenders: 0,
          missingGoalkeeper: 0,
          squadDepthScore: 0.75,
          daysSinceLastMatch: 7,
          daysUntilNextMatch: 5,
        },
      });
    },
  };

  const partialResult = buildFeatureScores({
    metadata: {
      homeTeam: "Partial Home",
      awayTeam: "Partial Away",
      squadAvailabilityProvider: partialProvider,
    },
  });
  const partialFeatures = getSquadFeatures(partialResult.features);
  assert(
    !partialFeatures.some(
      (feature) => feature.id === SQUAD_AVAILABILITY_FEATURE_IDS.suspensionImpact
    ),
    "missing suspension data should omit Suspension Impact feature"
  );
  assert(
    !partialFeatures.some(
      (feature) => feature.id === SQUAD_AVAILABILITY_FEATURE_IDS.midfieldAvailability
    ),
    "missing midfield data should omit Midfield Availability feature"
  );
  assert(
    partialFeatures.some(
      (feature) => feature.id === SQUAD_AVAILABILITY_FEATURE_IDS.attackAvailability
    ),
    "partial data should still emit computable attack availability"
  );

  const emptyResult = buildFeatureScores({
    metadata: {
      homeTeam: "Empty Home",
      awayTeam: "Empty Away",
    },
  });
  assert(
    getSquadFeatures(emptyResult.features).length === 0,
    "empty squad data should return empty feature array"
  );

  assert(buildFeatureScores({}).features.length === 0, "missing teams should return no features");

  for (const id of ALL_FEATURE_IDS) {
    assert(
      noInjuryFeatures.some((feature) => feature.id === id),
      `clean squad snapshot should include ${id}`
    );
  }

  for (const feature of noInjuryFeatures) {
    assert(
      feature.weight === getFeatureWeight("squadAvailability"),
      `${feature.id} weight should use squadAvailability`
    );
  }

  assert(
    MOCK_SQUAD_AVAILABILITY_FIXTURES.clean.home.injuries === 0,
    "clean fixture injuries"
  );

  assertBounds(noInjuryFeatures);
  assertBounds(getSquadFeatures(homeCleanAwayDepleted.features));
  assertBounds(partialFeatures);

  console.log("Squad Availability Feature tests passed.");
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

runTests();

export {};
