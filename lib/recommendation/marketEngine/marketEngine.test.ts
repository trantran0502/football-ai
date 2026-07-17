import type { MarketSelection } from "@/types/match";
import { AHAnalyzer } from "./analyzers/ahAnalyzer";
import { BTTSAnalyzer } from "./analyzers/bttsAnalyzer";
import { MoneylineAnalyzer } from "./analyzers/moneylineAnalyzer";
import { OUAnalyzer } from "./analyzers/ouAnalyzer";
import {
  createNotImplementedMarketHistoryProvider,
  NOT_IMPLEMENTED_HISTORICAL_PATTERN,
  type MarketHistoryProvider,
} from "./marketHistoryProvider";
import { runMarketEngine } from "./marketEngine";
import type { MarketAnalysis } from "./marketEngineTypes";
import { classifyWaterLevel, evaluateMarketOddsRules } from "./marketOddsRules";
import {
  clampMarketScore,
  computeMarketScore,
  deriveRiskLevel,
  MARKET_ENGINE_BASE_SCORE,
  MARKET_ENGINE_INITIAL_WEIGHT,
  scoreToConfidence,
} from "./marketScore";
import { runMarketRulesTests } from "./rules/marketRules.test";

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
    title: partial.title ?? "Market",
    period: partial.period ?? "full",
    rawLine: partial.rawLine ?? null,
    line: partial.line ?? null,
    modifier: partial.modifier ?? null,
    ...partial,
  };
}

function buildStandardMarkets(): MarketSelection[] {
  return [
    selection({
      marketType: "moneyline",
      marketFamily: "moneyline",
      title: "獨贏",
      side: "home",
      odds: 1.85,
      impliedProbability: 0.54,
    }),
    selection({
      marketType: "moneyline",
      marketFamily: "moneyline",
      title: "獨贏",
      side: "draw",
      odds: 3.4,
      impliedProbability: 0.29,
    }),
    selection({
      marketType: "moneyline",
      marketFamily: "moneyline",
      title: "獨贏",
      side: "away",
      odds: 4.2,
      impliedProbability: 0.24,
    }),
    selection({
      marketType: "handicap",
      marketFamily: "asianHandicap",
      title: "全場讓分",
      side: "home",
      odds: 0.92,
      line: -0.5,
      rawLine: "-0.5",
      modifier: "plain",
      handicap: -0.5,
      impliedProbability: 0.521,
    }),
    selection({
      marketType: "handicap",
      marketFamily: "asianHandicap",
      title: "全場讓分",
      side: "away",
      odds: 0.94,
      line: 0.5,
      rawLine: "+0.5",
      modifier: "plain",
      handicap: 0.5,
      impliedProbability: 0.515,
    }),
    selection({
      marketType: "totalGoals",
      marketFamily: "asianOverUnder",
      title: "全場大小",
      side: "over",
      odds: 0.9,
      line: 2.5,
      rawLine: "2.5",
      modifier: "plain",
      impliedProbability: 0.526,
    }),
    selection({
      marketType: "totalGoals",
      marketFamily: "asianOverUnder",
      title: "全場大小",
      side: "under",
      odds: 0.92,
      line: 2.5,
      rawLine: "2.5",
      modifier: "plain",
      impliedProbability: 0.515,
    }),
    selection({
      marketType: "btts",
      marketFamily: "btts",
      title: "兩隊入球",
      side: "yes",
      odds: 0.88,
      impliedProbability: 0.532,
    }),
    selection({
      marketType: "btts",
      marketFamily: "btts",
      title: "兩隊入球",
      side: "no",
      odds: 0.9,
      impliedProbability: 0.526,
    }),
  ];
}

function assertMarketAnalysisShape(analysis: MarketAnalysis, marketType: string): void {
  assert(analysis.marketType === marketType, `${marketType} marketType`);
  assert(Number.isFinite(analysis.confidence), `${marketType} confidence`);
  assert(analysis.confidence >= 0 && analysis.confidence <= 1, `${marketType} confidence range`);
  assert(Number.isFinite(analysis.marketScore), `${marketType} marketScore`);
  assert(analysis.marketScore >= 0 && analysis.marketScore <= 100, `${marketType} marketScore range`);
  assert(analysis.baseScore === MARKET_ENGINE_BASE_SCORE, `${marketType} baseScore`);
  assert(analysis.finalScore === analysis.marketScore, `${marketType} finalScore`);
  assert(Array.isArray(analysis.ruleResults) && analysis.ruleResults.length > 0, `${marketType} ruleResults`);
  assert(Array.isArray(analysis.scoreBreakdown) && analysis.scoreBreakdown.length > 0, `${marketType} scoreBreakdown`);
  assert(Array.isArray(analysis.auditLog) && analysis.auditLog.length > 0, `${marketType} auditLog`);
  assert(Array.isArray(analysis.reasons) && analysis.reasons.length > 0, `${marketType} reasons`);
  assert(Array.isArray(analysis.signals) && analysis.signals.length > 0, `${marketType} signals`);
  assert(typeof analysis.recommendation.label === "string", `${marketType} recommendation label`);
  assert(["low", "medium", "high"].includes(analysis.riskLevel), `${marketType} riskLevel`);
}

function testHistoricalInterface(): void {
  const provider = createNotImplementedMarketHistoryProvider();
  const pattern = provider.getHistoricalPattern({ marketType: "AH", line: -0.5 });

  assert(pattern.status === "notImplemented", "historical status");
  assert(pattern.message === "Not Implemented", "historical message");
  assert(pattern.sampleSize === null, "historical sampleSize");
  assert(pattern.hitRate === null, "historical hitRate");
  assert(pattern.roi === null, "historical roi");
  assert(pattern.confidence === null, "historical confidence");
  assert(
    NOT_IMPLEMENTED_HISTORICAL_PATTERN.message === "Not Implemented",
    "constant pattern message"
  );
}

function testMarketScore(): void {
  assertNear(MARKET_ENGINE_INITIAL_WEIGHT, 0.6, "initial market engine weight");
  assert(MARKET_ENGINE_BASE_SCORE === 65, "base score is 65");

  const highScore = computeMarketScore({
    impliedEdge: 0.8,
    balanceScore: 1,
    waterQualityScore: 1,
    patternPenalty: 0,
  });
  assert(highScore >= 70, "high score should be strong");
  assertNear(scoreToConfidence(highScore), highScore / 100, "score to confidence");

  const lowScore = computeMarketScore({
    impliedEdge: 0,
    balanceScore: -0.5,
    waterQualityScore: 0,
    patternPenalty: 1,
  });
  assert(lowScore <= 50, "low score should be weak");
  assert(deriveRiskLevel(highScore) === "low", "high score low risk");
  assert(deriveRiskLevel(lowScore) === "high", "low score high risk");
  assert(clampMarketScore(150) === 100, "clamp upper bound");
  assert(clampMarketScore(-10) === 0, "clamp lower bound");
}

function testMarketOddsRules(): void {
  assert(classifyWaterLevel(0.8, "hong_kong") === "low", "HK low water");
  assert(classifyWaterLevel(0.92, "hong_kong") === "mid", "HK mid water");
  assert(classifyWaterLevel(1.05, "hong_kong") === "high", "HK high water");

  const balanced = evaluateMarketOddsRules([
    selection({
      marketType: "handicap",
      marketFamily: "asianHandicap",
      side: "home",
      odds: 0.92,
      line: -0.5,
      impliedProbability: 0.521,
    }),
    selection({
      marketType: "handicap",
      marketFamily: "asianHandicap",
      side: "away",
      odds: 0.94,
      line: 0.5,
      impliedProbability: 0.515,
    }),
  ]);

  assert(balanced.isBalanced, "balanced AH market");
  assert(balanced.oddsDiff !== null && balanced.oddsDiff <= 0.06, "small odds diff");
  assert(balanced.signals.some((signal) => signal.id === "market_pattern"), "pattern signal");
}

function testMoneylineAnalyzer(): void {
  const history = createNotImplementedMarketHistoryProvider();
  const markets = buildStandardMarkets();
  const analysis = MoneylineAnalyzer.analyze(markets, history);

  assert(analysis !== null, "1X2 analysis exists");
  assertMarketAnalysisShape(analysis!, "1X2");
  assert(analysis!.historicalSample === null, "1X2 historical sample not implemented");
  assert(analysis!.recommendation.action === "lean", "1X2 lean recommendation");
  assert(analysis!.recommendation.side === "home", "1X2 lean home");
}

function testAHAnalyzer(): void {
  const history = createNotImplementedMarketHistoryProvider();
  const markets = buildStandardMarkets();
  const analysis = AHAnalyzer.analyze(markets, history);

  assert(analysis !== null, "AH analysis exists");
  assertMarketAnalysisShape(analysis!, "AH");
  assert(analysis!.line === -0.5, "AH line");
  assert(analysis!.signals.some((signal) => signal.id === "home_water_level"), "AH water signal");
}

function testOUAnalyzer(): void {
  const history = createNotImplementedMarketHistoryProvider();
  const markets = buildStandardMarkets();
  const analysis = OUAnalyzer.analyze(markets, history);

  assert(analysis !== null, "O/U analysis exists");
  assertMarketAnalysisShape(analysis!, "O/U");
  assert(analysis!.line === 2.5, "O/U line");
  assert(analysis!.recommendation.action === "lean", "O/U lean");
}

function testBTTSAnalyzer(): void {
  const history = createNotImplementedMarketHistoryProvider();
  const markets = buildStandardMarkets();
  const analysis = BTTSAnalyzer.analyze(markets, history);

  assert(analysis !== null, "BTTS analysis exists");
  assertMarketAnalysisShape(analysis!, "BTTS");
  assert(["yes", "no"].includes(analysis!.recommendation.side ?? ""), "BTTS side");
}

function testRunMarketEngine(): void {
  const snapshot = runMarketEngine(buildStandardMarkets());

  assert(snapshot.engineVersion === "1.1.0", "engine version");
  assertNear(snapshot.marketEngineWeight, 0.6, "snapshot weight");
  assert(snapshot.markets.length === 4, "four market analyses");
  assert(
    snapshot.markets.map((item) => item.marketType).join(",") === "1X2,AH,O/U,BTTS",
    "market order"
  );

  for (const market of snapshot.markets) {
    assertMarketAnalysisShape(market, market.marketType);
    assert(market.historicalConfidence === null, `${market.marketType} historical confidence`);
  }
}

function testCustomHistoryProvider(): void {
  const customProvider: MarketHistoryProvider = {
    getHistoricalPattern() {
      return {
        status: "available",
        sampleSize: 10,
        hitRate: 0.55,
        roi: 0.08,
        confidence: 0.62,
      };
    },
  };

  const analysis = MoneylineAnalyzer.analyze(buildStandardMarkets(), customProvider);
  assert(analysis !== null, "custom provider analysis");
  assert(analysis!.historicalSample === 10, "custom sample size");
  assertNear(analysis!.historicalConfidence ?? 0, 0.62, "custom historical confidence");
}

export function runMarketEngineTests(): void {
  testHistoricalInterface();
  testMarketScore();
  testMarketOddsRules();
  testMoneylineAnalyzer();
  testAHAnalyzer();
  testOUAnalyzer();
  testBTTSAnalyzer();
  testRunMarketEngine();
  testCustomHistoryProvider();
  runMarketRulesTests();
}
