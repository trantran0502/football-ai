import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import { buildBettingIntelligence } from "@/lib/betting/intelligenceEngine";
import {
  analyzeBookmakerConsensus,
  detectReverseLineMovement,
  detectSteamMove,
} from "@/lib/betting/marketConsensus";
import {
  buildMarketKey,
  toOddsSnapshot,
} from "@/lib/betting/marketAnalyzer";
import {
  buildValueBetMetrics,
  calculateExpectedValue,
} from "@/lib/betting/valueBetCalculator";
import { calculateClosingLineValue } from "@/lib/betting/closingLine";
import { fuseFeatureScores } from "@/lib/analysis/featureScore/fusion/featureFusionEngine";
import { buildFeatureScores } from "@/lib/analysis/featureScore/featureScoreEngine";
import { convertRawOdds } from "@/lib/analysis/featureScore/oddsConversion";
import type {
  BookmakerSelectionQuote,
  OddsHistoryTimeline,
} from "@/lib/betting/intelligenceTypes";
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

function buildBookmakerQuote(
  bookmakerId: string,
  odds: number,
  timestamp: string
): BookmakerSelectionQuote | null {
  const converted = convertRawOdds(odds);
  if (!converted) {
    return null;
  }
  return {
    bookmakerId,
    odds: converted.rawOdds,
    decimalOdds: converted.decimalOdds,
    impliedProbability: converted.impliedProbability,
    format: converted.format,
    timestamp,
  };
}

function runTests(): void {
  const hongKong = convertRawOdds(0.88);
  assert(hongKong !== null, "Hong Kong odds should convert");
  assert(hongKong!.format === "hong_kong", "0.88 should be Hong Kong format");
  assertNear(hongKong!.decimalOdds, 1.88, "Hong Kong decimal odds");

  const european = convertRawOdds(2.1);
  assert(european !== null, "European odds should convert");
  assert(european!.format === "decimal", "2.1 should be decimal format");
  assertNear(european!.impliedProbability, 1 / 2.1, "European implied probability");

  const markets = [
    selection({ marketType: "moneyline", side: "home", odds: 0.85, title: "獨贏" }),
    selection({ marketType: "moneyline", side: "draw", odds: 3.4, title: "獨贏" }),
    selection({ marketType: "moneyline", side: "away", odds: 4.2, title: "獨贏" }),
    selection({
      marketType: "handicap",
      marketFamily: "asianHandicap",
      side: "home",
      odds: 0.92,
      line: -0.5,
      title: "全場讓分",
    }),
    selection({
      marketType: "handicap",
      marketFamily: "asianHandicap",
      side: "away",
      odds: 0.98,
      line: 0.5,
      title: "全場讓分",
    }),
    selection({
      marketType: "totalGoals",
      marketFamily: "asianOverUnder",
      side: "over",
      odds: 0.9,
      line: 2.5,
      title: "全場大小",
    }),
    selection({
      marketType: "totalGoals",
      marketFamily: "asianOverUnder",
      side: "under",
      odds: 0.96,
      line: 2.5,
      title: "全場大小",
    }),
    selection({ marketType: "btts", side: "yes", odds: 0.82, title: "雙方進球" }),
    selection({ marketType: "btts", side: "no", odds: 1.02, title: "雙方進球" }),
  ];

  const featureResult = buildFeatureScores({ marketSelections: markets });
  const fusion = fuseFeatureScores(featureResult.features);

  const homeKey = buildMarketKey(markets[0]);
  const timelines: OddsHistoryTimeline[] = [
    {
      marketKey: homeKey,
      marketType: "moneyline",
      period: "full",
      side: "home",
      title: "獨贏",
      line: null,
      points: [
        {
          timestamp: "2026-07-15T08:00:00.000Z",
          source: "opening",
          odds: 0.8,
          decimalOdds: 1.8,
          impliedProbability: 1 / 1.8,
          movement: "unknown",
        },
        {
          timestamp: "2026-07-15T12:00:00.000Z",
          source: "pinnacle",
          odds: 0.85,
          decimalOdds: 1.85,
          impliedProbability: 1 / 1.85,
          movement: "up",
        },
        {
          timestamp: "2026-07-15T18:00:00.000Z",
          source: "closing",
          odds: 0.9,
          decimalOdds: 1.9,
          impliedProbability: 1 / 1.9,
          movement: "up",
        },
      ],
    },
  ];

  const bookmakerQuotes = [
    buildBookmakerQuote("pinnacle", 0.85, "2026-07-15T12:00:00.000Z"),
    buildBookmakerQuote("bet365", 0.84, "2026-07-15T12:00:00.000Z"),
    buildBookmakerQuote("188bet", 0.86, "2026-07-15T12:00:00.000Z"),
    buildBookmakerQuote("sbobet", 0.83, "2026-07-15T12:00:00.000Z"),
    buildBookmakerQuote("1xbet", 0.87, "2026-07-15T12:00:00.000Z"),
  ].filter((quote): quote is BookmakerSelectionQuote => quote !== null);

  const intelligence = buildBettingIntelligence({
    marketSelections: markets,
    oddsHistory: { timelines },
    multiBookmaker: {
      markets: [
        {
          marketKey: homeKey,
          selections: bookmakerQuotes,
        },
      ],
    },
    fusion,
    capturedAt: "2026-07-15T20:00:00.000Z",
  });

  assert(intelligence.selections.length > 0, "should analyze selections");
  assert(intelligence.signals.length === 9, "should emit 9 intelligence signals");
  assert(intelligence.marketTypes.length >= 4, "should group major market types");

  const homeSelection = intelligence.selections.find(
    (item) => item.marketKey === homeKey
  );
  assert(Boolean(homeSelection), "home moneyline should be analyzed");
  assert(
    homeSelection!.lineMovement.direction === "up",
    "home odds should show upward movement"
  );
  assert(
    homeSelection!.lineMovement.priceDelta !== null,
    "price delta should be computed"
  );

  const valueBet = homeSelection!.valueBet;
  assert(valueBet !== null, "value bet metrics should exist");
  assert(Number.isFinite(valueBet!.expectedValue), "expected value should be finite");
  assert(Number.isFinite(valueBet!.expectedValuePercent), "EV percent should be finite");
  assert(valueBet!.fairOdds > 1, "fair odds should exceed 1");

  const clv = calculateClosingLineValue({
    takenDecimalOdds: 1.85,
    closingDecimalOdds: 1.9,
  });
  assert(clv !== null, "CLV should be computable");
  assertNear(clv!, 1.85 / 1.9 - 1, "CLV formula");

  const consensus = analyzeBookmakerConsensus(bookmakerQuotes);
  assert(consensus.status === "aligned", "bookmakers should be broadly aligned");
  assert(consensus.spread < 0.05, "aligned spread should be small");

  const divergentQuotes = [
    buildBookmakerQuote("pinnacle", 0.7, "2026-07-15T12:00:00.000Z")!,
    buildBookmakerQuote("bet365", 0.95, "2026-07-15T12:00:00.000Z")!,
  ];
  const divergent = analyzeBookmakerConsensus(divergentQuotes);
  assert(divergent.status === "divergent", "large spread should be divergent");

  const steam = detectSteamMove({
    selections: intelligence.selections.map((item) => ({
      marketKey: item.marketKey,
      lineMovement: item.lineMovement,
    })),
    threshold: 0.03,
  });
  assert(steam.detected, "steam move should be detected for rising home price");

  const reverse = detectReverseLineMovement({
    lineDirection: "up",
    priceDirection: "down",
  });
  assert(reverse.detected, "reverse line movement should be detected");

  const empty = buildBettingIntelligence({
    marketSelections: [],
    oddsHistory: { timelines: [] },
    fusion: null,
  });
  assert(empty.selections.length === 0, "empty input should produce empty selections");
  assert(empty.summary.totalSelections === 0, "empty summary should be zero");

  const invalidSnapshot = toOddsSnapshot(-1);
  assert(invalidSnapshot === null, "invalid odds should return null snapshot");

  const ev = calculateExpectedValue(0.55, 2.0);
  assertNear(ev, 0.1, "EV should be probability*odds-1");

  const metrics = buildValueBetMetrics({
    decimalOdds: 2,
    impliedProbability: 0.5,
    fairProbability: 0.55,
    fusion,
  });
  assert(metrics.valueRating !== "none" || metrics.expectedValue <= 0, "value rating should resolve");

  const sampleOdds = `Arsenal vs Chelsea
獨贏
主 0.85
和 3.4
客 4.2
全場大小
大(2.5) 0.90
小(2.5) 0.96
雙方進球
是 0.82
否 1.02`;

  const report = analyzeMatch(sampleOdds);
  assert(report.bettingIntelligence !== null, "analyzeMatch should attach betting intelligence");
  assert(
    report.bettingIntelligence!.signals.some((signal) => signal.id === "value_signal"),
    "analyzeMatch intelligence should include value signal"
  );

  console.log("Betting intelligence tests passed.");
  console.log(`- Selections analyzed: ${intelligence.selections.length}`);
  console.log(`- Value bets: ${intelligence.summary.valueBetCount}`);
  console.log(`- Average EV: ${(intelligence.summary.averageExpectedValue * 100).toFixed(2)}%`);
  console.log(`- Steam move: ${steam.detected}`);
  console.log(`- Consensus status: ${consensus.status}`);
}

runTests();
