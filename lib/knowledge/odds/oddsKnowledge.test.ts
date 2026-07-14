import { calculateImpliedProbability } from "@/lib/knowledge/odds/impliedProbability";
import {
  convertOdds,
  registerPlatformConverter,
} from "@/lib/knowledge/odds/oddsConverter";
import { normalizeMarket } from "@/lib/knowledge/odds/marketNormalizer";

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

function testConvertOdds(): void {
  const decimal = convertOdds({ platform: "decimal", value: 2.1 });
  assertTruthy(decimal, "decimal conversion should succeed");
  assertEqual(decimal.decimal, 2.1, "decimal odds");

  const hongkong = convertOdds({ platform: "hongkong", value: 0.9 });
  assertTruthy(hongkong, "hongkong conversion should succeed");
  assertEqual(hongkong.decimal, 1.9, "hongkong odds");

  const malayPositive = convertOdds({ platform: "malay", value: 0.85 });
  assertTruthy(malayPositive, "malay positive conversion should succeed");
  assertEqual(malayPositive.decimal, 1.85, "malay positive odds");

  const malayNegative = convertOdds({ platform: "malay", value: -0.9 });
  assertTruthy(malayNegative, "malay negative conversion should succeed");
  assertEqual(malayNegative.decimal, 1 + 1 / 0.9, "malay negative odds");

  const indonesianPositive = convertOdds({ platform: "indonesian", value: 0.75 });
  assertTruthy(indonesianPositive, "indonesian positive conversion should succeed");
  assertEqual(indonesianPositive.decimal, 1.75, "indonesian positive odds");

  const indonesianNegative = convertOdds({ platform: "indonesian", value: -1.25 });
  assertTruthy(indonesianNegative, "indonesian negative conversion should succeed");
  assertEqual(indonesianNegative.decimal, 1 - 1 / -1.25, "indonesian negative odds");

  const americanPositive = convertOdds({ platform: "american", value: 150 });
  assertTruthy(americanPositive, "american positive conversion should succeed");
  assertEqual(americanPositive.decimal, 2.5, "american positive odds");

  const americanNegative = convertOdds({ platform: "american", value: -200 });
  assertTruthy(americanNegative, "american negative conversion should succeed");
  assertEqual(americanNegative.decimal, 1.5, "american negative odds");

  const invalid = convertOdds({ platform: "decimal", value: 0.5 });
  if (invalid !== null) {
    throw new Error("invalid decimal odds should return null");
  }

  registerPlatformConverter("custom", (value) => value * 2);
  const custom = convertOdds({ platform: "custom", value: 1.05 });
  assertTruthy(custom, "custom platform conversion should succeed");
  assertEqual(custom.decimal, 2.1, "custom platform odds");

  const unknown = convertOdds({ platform: "unknown-platform", value: 2 });
  if (unknown !== null) {
    throw new Error("unknown platform should return null");
  }
}

function testCalculateImpliedProbability(): void {
  const probability = calculateImpliedProbability(2);
  assertTruthy(probability, "probability should be calculated");
  assertEqual(probability, 0.5, "implied probability for odds 2");

  const invalid = calculateImpliedProbability(0);
  if (invalid !== null) {
    throw new Error("invalid odds should return null probability");
  }

  const negative = calculateImpliedProbability(-1.5);
  if (negative !== null) {
    throw new Error("negative odds should return null probability");
  }
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
  assertEqual(away.decimalOdds, 2.5, "away decimal odds from hongkong");
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
    yes: { platform: "decimal", value: 0.75 },
    no: { platform: "decimal", value: 1.05 },
  });

  assertLength(market.selections.length, 1, "invalid decimal odds should be skipped");
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
