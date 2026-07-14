import { calculateImpliedProbability } from "@/lib/knowledge/odds/impliedProbability";
import { convertOdds } from "@/lib/knowledge/odds/oddsConverter";
import { normalizeMarket } from "@/lib/knowledge/odds/marketNormalizer";
import {
  convertRawOdds,
  convertRawOddsToImpliedProbability,
} from "@/lib/analysis/featureScore/oddsConversion";

const EPSILON = 1e-9;

function assertEqual(actual: number, expected: number, message: string): void {
  if (Math.abs(actual - expected) > EPSILON) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertTruthy<T>(value: T | null | undefined, message: string): asserts value is T {
  if (!value) {
    throw new Error(message);
  }
}

function assertLength(actual: number, expected: number, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected length ${expected}, got ${actual}`);
  }
}

function assertProbabilityWithinRange(
  probability: number,
  message: string
): void {
  if (probability < 0 || probability > 1) {
    throw new Error(`${message}: probability ${probability} out of range`);
  }
}

function testConvertOdds(): void {
  const decimal = convertOdds({ platform: "decimal", value: 2.1 });
  assertTruthy(decimal, "decimal conversion should succeed");
  assertEqual(decimal.decimal, 2.1, "decimal odds");

  const hongkong = convertOdds({ platform: "hongkong", value: 0.9 });
  assertTruthy(hongkong, "hongkong conversion should succeed");
  assertEqual(hongkong.decimal, 1.9, "hongkong odds");

  const hk070 = convertOdds({ platform: "hongkong", value: 0.7 });
  assertTruthy(hk070, "0.7 conversion should succeed");
  assertEqual(hk070.decimal, 1.7, "0.7 hongkong odds");

  const unifiedFromNegative = convertOdds({ platform: "malay", value: -0.9 });
  if (unifiedFromNegative !== null) {
    throw new Error("negative raw odds should return null under unified conversion");
  }

  const unifiedAmerican = convertOdds({ platform: "american", value: 150 });
  assertTruthy(unifiedAmerican, "large decimal-like value should convert");
  assertEqual(unifiedAmerican.decimal, 150, "150 treated as decimal odds");

  const invalid = convertOdds({ platform: "decimal", value: 0 });
  if (invalid !== null) {
    throw new Error("zero odds should return null");
  }

  const unknown = convertOdds({ platform: "unknown-platform", value: 2.1 });
  assertTruthy(unknown, "platform label is ignored; numeric rules still apply");
  assertEqual(unknown.decimal, 2.1, "unknown platform uses unified numeric conversion");
}

function testCalculateImpliedProbability(): void {
  const probability = calculateImpliedProbability(2);
  assertTruthy(probability, "probability should be calculated");
  assertEqual(probability, 0.5, "implied probability for odds 2");
  assertProbabilityWithinRange(probability, "decimal implied probability");

  const hkProbability = convertRawOddsToImpliedProbability(0.88);
  assertTruthy(hkProbability, "HK probability should be calculated");
  assertEqual(hkProbability, 1 / 1.88, "0.88 HK implied probability");
  assertProbabilityWithinRange(hkProbability, "HK implied probability");

  const invalid = calculateImpliedProbability(0);
  if (invalid !== null) {
    throw new Error("invalid odds should return null probability");
  }

  const negative = calculateImpliedProbability(-1.5);
  if (negative !== null) {
    throw new Error("negative odds should return null probability");
  }

  const rawConverted = convertRawOdds(0.95);
  assertTruthy(rawConverted, "0.95 should convert");
  assertProbabilityWithinRange(
    rawConverted.impliedProbability,
    "convertRawOdds implied probability"
  );
}

function testNormalizeMoneyline(): void {
  const market = normalizeMarket({
    kind: "moneyline",
    home: { platform: "decimal", value: 2.1 },
    draw: { platform: "decimal", value: 3.2 },
    away: { platform: "hongkong", value: 1.5 },
  });

  if (market.kind !== "moneyline") {
    throw new Error("expected moneyline market kind");
  }
  assertLength(market.selections.length, 3, "moneyline selections");

  const home = market.selections.find((item) => item.side === "home");
  const draw = market.selections.find((item) => item.side === "draw");
  const away = market.selections.find((item) => item.side === "away");

  assertTruthy(home, "home selection");
  assertEqual(home.decimalOdds, 2.1, "home decimal odds");
  assertEqual(home.impliedProbability, 1 / 2.1, "home implied probability");
  assertTruthy(draw, "draw selection");
  assertEqual(draw.decimalOdds, 3.2, "draw decimal odds");
  assertTruthy(away, "away selection");
  assertEqual(away.decimalOdds, 1.5, "away decimal odds (>= 1.01 stays decimal)");
  assertEqual(away.impliedProbability, 1 / 1.5, "away implied probability");
}

function testNormalizeHandicap(): void {
  const market = normalizeMarket({
    kind: "handicap",
    line: "0-50",
    home: { platform: "hongkong", value: 0.9 },
    away: { platform: "hongkong", value: 0.95 },
  });

  if (market.kind !== "handicap") {
    throw new Error("expected handicap market kind");
  }
  assertLength(market.selections.length, 2, "handicap selections");

  const home = market.selections.find((item) => item.side === "home");
  assertTruthy(home, "handicap home selection");
  assertEqual(home.rawLine, "0-50", "handicap raw line");
  if (home.line !== null) {
    throw new Error("non-numeric handicap line should keep numeric null");
  }
  assertProbabilityWithinRange(home.impliedProbability, "handicap home probability");
}

function testNormalizeOverUnder(): void {
  const market = normalizeMarket({
    kind: "overUnder",
    line: 2.5,
    over: { platform: "hongkong", value: 0.88 },
    under: { platform: "hongkong", value: 0.98 },
  });

  if (market.kind !== "overUnder") {
    throw new Error("expected overUnder market kind");
  }
  assertLength(market.selections.length, 2, "overUnder selections");

  const over = market.selections.find((item) => item.side === "over");
  const under = market.selections.find((item) => item.side === "under");

  assertTruthy(over, "over selection");
  assertEqual(over.line, 2.5, "over line");
  assertEqual(over.decimalOdds, 1.88, "over decimal odds from hongkong");
  assertEqual(over.impliedProbability, 1 / 1.88, "over implied probability");
  assertTruthy(under, "under selection");
  assertEqual(under.line, 2.5, "under line");
}

function testNormalizeBtts(): void {
  const market = normalizeMarket({
    kind: "btts",
    yes: { platform: "hongkong", value: 0.75 },
    no: { platform: "decimal", value: 1.05 },
  });

  if (market.kind !== "btts") {
    throw new Error("expected btts market kind");
  }
  assertLength(market.selections.length, 2, "btts selections");

  const yes = market.selections.find((item) => item.side === "yes");
  const no = market.selections.find((item) => item.side === "no");

  assertTruthy(yes, "yes selection");
  assertEqual(yes.decimalOdds, 1.75, "yes decimal odds from hongkong");
  assertEqual(yes.impliedProbability, 1 / 1.75, "yes implied probability");
  assertTruthy(no, "no selection");
  assertEqual(no.decimalOdds, 1.05, "no decimal odds");
}

function testNormalizeBttsSkipsInvalidOdds(): void {
  const market = normalizeMarket({
    kind: "btts",
    yes: { platform: "decimal", value: 0 },
    no: { platform: "decimal", value: 1.05 },
  });

  assertLength(market.selections.length, 1, "invalid zero odds should be skipped");
  if (market.selections[0]?.side !== "no") {
    throw new Error("only valid no selection should remain");
  }
}

function testNormalizeBttsValid(): void {
  const market = normalizeMarket({
    kind: "btts",
    yes: { platform: "decimal", value: 1.75 },
    no: { platform: "decimal", value: 2.05 },
  });

  assertLength(market.selections.length, 2, "valid btts selections");

  const yes = market.selections.find((item) => item.side === "yes");
  assertTruthy(yes, "valid yes selection");
  assertEqual(yes.impliedProbability, 1 / 1.75, "valid yes implied probability");
}

export function runOddsKnowledgeTests(): void {
  testConvertOdds();
  testCalculateImpliedProbability();
  testNormalizeMoneyline();
  testNormalizeHandicap();
  testNormalizeOverUnder();
  testNormalizeBtts();
  testNormalizeBttsSkipsInvalidOdds();
  testNormalizeBttsValid();
}
