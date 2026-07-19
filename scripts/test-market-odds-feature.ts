import {
  buildFeatureScores,
  convertRawOdds,
  getRegisteredFeatureCollectors,
  registerMarketOddsCollector,
  resetFeatureCollectorsForTests,
  resetMarketOddsCollectorRegistrationForTests,
  isMarketOddsCollectorRegistered,
  type MarketOddsFeatureMetadata,
} from "@/lib/analysis/featureScore";
import type { MarketSelection } from "@/types/match";

const EPSILON = 1e-4;

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

function selection(
  partial: Pick<MarketSelection, "marketType" | "side" | "odds"> &
    Partial<MarketSelection>
): MarketSelection {
  return {
    marketFamily: partial.marketFamily ?? "moneyline",
    title: partial.title ?? "獨贏",
    period: partial.period ?? "full",
    rawLine: partial.rawLine ?? null,
    line: partial.line ?? null,
    modifier: partial.modifier ?? null,
    ...partial,
  };
}

function getMarketOddsMetadata(
  features: ReturnType<typeof buildFeatureScores>["features"]
): MarketOddsFeatureMetadata {
  const feature = features.find((item) => item.id === "market_odds");
  assert(Boolean(feature), "market_odds feature should exist");
  return feature!.metadata as unknown as MarketOddsFeatureMetadata;
}

function runTests(): void {
  resetFeatureCollectorsForTests();
  resetMarketOddsCollectorRegistrationForTests();

  const hongKongCases = [
    { raw: 0.7, decimal: 1.7, probability: 1 / 1.7 },
    { raw: 0.88, decimal: 1.88, probability: 1 / 1.88 },
    { raw: 0.95, decimal: 1.95, probability: 1 / 1.95 },
  ];

  for (const testCase of hongKongCases) {
    const converted = convertRawOdds(testCase.raw);
    assert(converted !== null, `conversion failed for ${testCase.raw}`);
    assertNear(
      converted!.decimalOdds,
      testCase.decimal,
      `decimal odds for ${testCase.raw}`
    );
    assertNear(
      converted!.impliedProbability,
      testCase.probability,
      `implied probability for ${testCase.raw}`
    );
    assert(
      converted!.impliedProbability <= 1,
      `impliedProbability must not exceed 1 for ${testCase.raw}`
    );
  }

  const decimal105 = convertRawOdds(1.05);
  assert(decimal105 !== null, "decimal 1.05 conversion should succeed");
  assertNear(decimal105!.decimalOdds, 1.05, "1.05 should stay decimal when >= 1.01");
  assertNear(decimal105!.impliedProbability, 1 / 1.05, "decimal 1.05 probability");

  registerMarketOddsCollector();
  assert(isMarketOddsCollectorRegistered(), "collector should be registered");
  const collectorsAfterFirst = getRegisteredFeatureCollectors().length;
  registerMarketOddsCollector();
  assert(
    getRegisteredFeatureCollectors().length === collectorsAfterFirst,
    "duplicate registerMarketOddsCollector must not add another collector"
  );

  const decimalMoneyline = buildFeatureScores({
    marketSelections: [
      selection({ marketType: "moneyline", side: "home", odds: 2.1 }),
      selection({ marketType: "moneyline", side: "draw", odds: 3.2 }),
      selection({ marketType: "moneyline", side: "away", odds: 3.5 }),
    ],
  });
  const decimalMeta = getMarketOddsMetadata(decimalMoneyline.features);
  assert(decimalMeta.favorite === "home", "decimal favorite should be home");
  const expectedGap = 1 / 2.1 - 1 / 3.2;
  assertNear(decimalMeta.marketGap ?? 0, expectedGap, "decimal market gap");
  assert(decimalMoneyline.features[0].score === 20, "decimal score should be 20");
  assert(
    decimalMeta.oddsFormat === "decimal",
    "decimal moneyline format should be decimal"
  );

  const hongKongMoneyline = buildFeatureScores({
    marketSelections: [
      selection({ marketType: "moneyline", side: "home", odds: 0.7 }),
      selection({ marketType: "moneyline", side: "draw", odds: 0.88 }),
      selection({ marketType: "moneyline", side: "away", odds: 0.95 }),
    ],
  });
  const hkMeta = getMarketOddsMetadata(hongKongMoneyline.features);
  assertNear(hkMeta.favoriteProbability ?? 0, 1 / 1.7, "HK home probability");
  assertNear(hkMeta.secondProbability ?? 0, 1 / 1.88, "HK draw probability");
  assert(
    (hkMeta.favoriteProbability ?? 2) <= 1 &&
      (hkMeta.secondProbability ?? 2) <= 1,
    "HK implied probabilities must not exceed 1"
  );
  assert(hkMeta.oddsFormat === "hong_kong", "HK moneyline format");
  assert(hongKongMoneyline.features[0].score === 10, "HK score should be 10");

  const evenMarket = buildFeatureScores({
    marketSelections: [
      selection({ marketType: "moneyline", side: "home", odds: 1.95 }),
      selection({ marketType: "moneyline", side: "draw", odds: 1.96 }),
      selection({ marketType: "moneyline", side: "away", odds: 1.97 }),
    ],
  });
  assert(evenMarket.features[0].score === 0, "even market score should be 0");
  assert(
    evenMarket.features[0].reason.includes("五五波"),
    "even market reason should mention 五五波"
  );

  const strongFavorite = buildFeatureScores({
    marketSelections: [
      selection({ marketType: "moneyline", side: "home", odds: 1.5 }),
      selection({ marketType: "moneyline", side: "draw", odds: 4.0 }),
      selection({ marketType: "moneyline", side: "away", odds: 5.0 }),
    ],
  });
  assert(
    strongFavorite.features[0].score === 30,
    "strong favorite score should be 30"
  );
  assert(
    strongFavorite.features[0].confidence >= 0.85,
    "strong favorite confidence should be high"
  );

  const missingData = buildFeatureScores({
    marketSelections: [
      selection({ marketType: "moneyline", side: "home", odds: 2.1 }),
      selection({ marketType: "moneyline", side: "away", odds: 3.5 }),
      selection({ marketType: "handicap", side: "home", odds: 0.9, marketFamily: "asianHandicap", title: "讓分" }),
    ],
  });
  assert(missingData.features[0].score === 0, "missing draw should score 0");
  assert(
    missingData.features[0].confidence <= 0.3,
    "missing draw confidence should be <= 0.3"
  );

  const mixedFormat = buildFeatureScores({
    marketSelections: [
      selection({ marketType: "moneyline", side: "home", odds: 2.1 }),
      selection({ marketType: "moneyline", side: "draw", odds: 0.88 }),
      selection({ marketType: "moneyline", side: "away", odds: 3.5 }),
    ],
  });
  const mixedMeta = getMarketOddsMetadata(mixedFormat.features);
  assert(mixedMeta.oddsFormat === "mixed", "mixed decimal/HK should be mixed");
  assert(
    mixedFormat.features[0].confidence <= 0.5,
    "mixed format should reduce confidence"
  );

  assert(
    buildFeatureScores({ marketSelections: [] }).features[0].score === 0,
    "empty selections should score 0"
  );

  for (const feature of [
    decimalMoneyline.features[0],
    hongKongMoneyline.features[0],
    evenMarket.features[0],
    strongFavorite.features[0],
    missingData.features[0],
  ]) {
    assert(
      (feature.score ?? 0) >= -100 && (feature.score ?? 0) <= 100,
      "score must stay within [-100, 100]"
    );
    assert(
      feature.confidence >= 0 && feature.confidence <= 1,
      "confidence must stay within [0, 1]"
    );
  }

  console.log("Market Odds Feature tests passed.");
}

runTests();

export {};
