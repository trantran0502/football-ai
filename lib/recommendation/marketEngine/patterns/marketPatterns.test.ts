import type { MarketSelection } from "@/types/match";
import { evaluateMarketOddsRules } from "../marketOddsRules";
import { createNotImplementedMarketHistoryProvider } from "../marketHistoryProvider";
import { MARKET_ENGINE_BASE_SCORE } from "../marketScore";
import { runMarketRuleEngine } from "../rules/ruleEngine";
import { MARKET_RULE_REGISTRY } from "../rules/ruleRegistry";
import {
  evaluatePatternMatch,
  getPatternDefinitionById,
  listPatternIds,
  MARKET_PATTERN_REGISTRY,
} from "./patternRegistry";
import { runMarketPatternEngine } from "./patternEngine";
import type { PatternMatchContext } from "./patternTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
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

function buildPatternContext(
  marketType: PatternMatchContext["marketType"],
  selections: MarketSelection[]
): PatternMatchContext {
  const oddsContext = evaluateMarketOddsRules(selections);
  const ruleResults = runMarketRuleEngine({
    marketType,
    selections,
    oddsContext,
  }).ruleResults;

  return {
    marketType,
    selections,
    oddsContext,
    ruleResults,
  };
}

function assertPatternMatch(patternId: string, context: PatternMatchContext): void {
  const definition = getPatternDefinitionById(patternId);
  assert(definition !== undefined, `${patternId} exists`);
  const result = evaluatePatternMatch(definition!, context);
  assert(result.matched, `${patternId} should match: ${result.reason}`);
}

function assertPatternNoMatch(patternId: string, context: PatternMatchContext): void {
  const definition = getPatternDefinitionById(patternId);
  assert(definition !== undefined, `${patternId} exists`);
  const result = evaluatePatternMatch(definition!, context);
  assert(!result.matched, `${patternId} should not match`);
}

function testPatternRegistry(): void {
  assert(MARKET_PATTERN_REGISTRY.length === 10, "registry has 10 patterns");
  assert(listPatternIds().includes("HomeLowWaterBalanced"), "HomeLowWaterBalanced registered");
  assert(listPatternIds().includes("TrapCandidate"), "TrapCandidate registered");

  const definition = getPatternDefinitionById("HomeLowWaterBalanced");
  assert(definition?.requiredRules.includes("LowWaterRule"), "required LowWaterRule");
  assert(definition?.requiredRules.includes("BalancedMarketRule"), "required BalancedMarketRule");
}

function testHomeLowWaterBalanced(): void {
  const match = buildPatternContext("AH", [
    selection({
      marketType: "handicap",
      marketFamily: "asianHandicap",
      side: "home",
      odds: 0.79,
      line: -0.5,
      impliedProbability: 0.558,
    }),
    selection({
      marketType: "handicap",
      marketFamily: "asianHandicap",
      side: "away",
      odds: 0.81,
      line: 0.5,
      impliedProbability: 0.549,
    }),
  ]);
  const noMatch = buildPatternContext("AH", [
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

  assertPatternMatch("HomeLowWaterBalanced", match);
  assertPatternNoMatch("HomeLowWaterBalanced", noMatch);
}

function testHomeLowWaterFavorite(): void {
  const match = buildPatternContext("AH", [
    selection({
      marketType: "handicap",
      marketFamily: "asianHandicap",
      side: "home",
      odds: 0.79,
      line: -0.5,
      impliedProbability: 0.62,
    }),
    selection({
      marketType: "handicap",
      marketFamily: "asianHandicap",
      side: "away",
      odds: 0.98,
      line: 0.5,
      impliedProbability: 0.48,
    }),
  ]);
  const noMatch = buildPatternContext("AH", [
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

  assertPatternMatch("HomeLowWaterFavorite", match);
  assertPatternNoMatch("HomeLowWaterFavorite", noMatch);
}

function testAwayHighWaterValue(): void {
  const match = buildPatternContext("1X2", [
    selection({
      marketType: "moneyline",
      side: "home",
      odds: 1.55,
      impliedProbability: 0.58,
    }),
    selection({
      marketType: "moneyline",
      side: "draw",
      odds: 3.6,
      impliedProbability: 0.25,
    }),
    selection({
      marketType: "moneyline",
      side: "away",
      odds: 4.5,
      impliedProbability: 0.17,
    }),
  ]);
  const noMatch = buildPatternContext("1X2", [
    selection({
      marketType: "moneyline",
      side: "home",
      odds: 1.8,
      impliedProbability: 0.56,
    }),
    selection({
      marketType: "moneyline",
      side: "draw",
      odds: 3.4,
      impliedProbability: 0.29,
    }),
    selection({
      marketType: "moneyline",
      side: "away",
      odds: 2.1,
      impliedProbability: 0.28,
    }),
  ]);

  assertPatternMatch("AwayHighWaterValue", match);
  assertPatternNoMatch("AwayHighWaterValue", noMatch);
}

function testBalancedFavorite(): void {
  const match = buildPatternContext("AH", [
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
  const noMatch = buildPatternContext("AH", [
    selection({
      marketType: "handicap",
      marketFamily: "asianHandicap",
      side: "home",
      odds: 0.79,
      line: -0.5,
      impliedProbability: 0.558,
    }),
    selection({
      marketType: "handicap",
      marketFamily: "asianHandicap",
      side: "away",
      odds: 0.98,
      line: 0.5,
      impliedProbability: 0.505,
    }),
  ]);

  assertPatternMatch("BalancedFavorite", match);
  assertPatternNoMatch("BalancedFavorite", noMatch);
}

function testBalancedUnderdog(): void {
  const match = buildPatternContext("BTTS", [
    selection({
      marketType: "btts",
      marketFamily: "btts",
      side: "yes",
      odds: 0.97,
      impliedProbability: 0.515,
    }),
    selection({
      marketType: "btts",
      marketFamily: "btts",
      side: "no",
      odds: 0.99,
      impliedProbability: 0.502,
    }),
  ]);
  const noMatch = buildPatternContext("AH", [
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

  assertPatternMatch("BalancedUnderdog", match);
  assertPatternNoMatch("BalancedUnderdog", noMatch);
}

function testExtremeFavorite(): void {
  const match = buildPatternContext("1X2", [
    selection({
      marketType: "moneyline",
      side: "home",
      odds: 1.35,
      impliedProbability: 0.74,
    }),
    selection({
      marketType: "moneyline",
      side: "draw",
      odds: 4.8,
      impliedProbability: 0.12,
    }),
    selection({
      marketType: "moneyline",
      side: "away",
      odds: 8.5,
      impliedProbability: 0.08,
    }),
  ]);
  const noMatch = buildPatternContext("1X2", [
    selection({
      marketType: "moneyline",
      side: "home",
      odds: 2.2,
      impliedProbability: 0.4,
    }),
    selection({
      marketType: "moneyline",
      side: "draw",
      odds: 3.2,
      impliedProbability: 0.32,
    }),
    selection({
      marketType: "moneyline",
      side: "away",
      odds: 3.5,
      impliedProbability: 0.28,
    }),
  ]);

  assertPatternMatch("ExtremeFavorite", match);
  assertPatternNoMatch("ExtremeFavorite", noMatch);
}

function testExtremeUnderdog(): void {
  const match = buildPatternContext("1X2", [
    selection({
      marketType: "moneyline",
      side: "home",
      odds: 1.35,
      impliedProbability: 0.74,
    }),
    selection({
      marketType: "moneyline",
      side: "draw",
      odds: 4.8,
      impliedProbability: 0.12,
    }),
    selection({
      marketType: "moneyline",
      side: "away",
      odds: 8.5,
      impliedProbability: 0.08,
    }),
  ]);
  const noMatch = buildPatternContext("1X2", [
    selection({
      marketType: "moneyline",
      side: "home",
      odds: 2.2,
      impliedProbability: 0.4,
    }),
    selection({
      marketType: "moneyline",
      side: "draw",
      odds: 3.2,
      impliedProbability: 0.32,
    }),
    selection({
      marketType: "moneyline",
      side: "away",
      odds: 3.5,
      impliedProbability: 0.28,
    }),
  ]);

  assertPatternMatch("ExtremeUnderdog", match);
  assertPatternNoMatch("ExtremeUnderdog", noMatch);
}

function testLowOverroundBalanced(): void {
  const match = buildPatternContext("BTTS", [
    selection({
      marketType: "btts",
      marketFamily: "btts",
      side: "yes",
      odds: 0.9,
      impliedProbability: 0.515,
    }),
    selection({
      marketType: "btts",
      marketFamily: "btts",
      side: "no",
      odds: 0.92,
      impliedProbability: 0.512,
    }),
  ]);
  const noMatch = buildPatternContext("BTTS", [
    selection({
      marketType: "btts",
      marketFamily: "btts",
      side: "yes",
      odds: 0.88,
      impliedProbability: 0.65,
    }),
    selection({
      marketType: "btts",
      marketFamily: "btts",
      side: "no",
      odds: 0.88,
      impliedProbability: 0.65,
    }),
  ]);

  assertPatternMatch("LowOverroundBalanced", match);
  assertPatternNoMatch("LowOverroundBalanced", noMatch);
}

function testHighOverroundRisk(): void {
  const match = buildPatternContext("BTTS", [
    selection({
      marketType: "btts",
      marketFamily: "btts",
      side: "yes",
      odds: 0.88,
      impliedProbability: 0.65,
    }),
    selection({
      marketType: "btts",
      marketFamily: "btts",
      side: "no",
      odds: 0.88,
      impliedProbability: 0.65,
    }),
  ]);
  const noMatch = buildPatternContext("BTTS", [
    selection({
      marketType: "btts",
      marketFamily: "btts",
      side: "yes",
      odds: 0.88,
      impliedProbability: 0.532,
    }),
    selection({
      marketType: "btts",
      marketFamily: "btts",
      side: "no",
      odds: 0.9,
      impliedProbability: 0.526,
    }),
  ]);

  assertPatternMatch("HighOverroundRisk", match);
  assertPatternNoMatch("HighOverroundRisk", noMatch);
}

function testTrapCandidate(): void {
  const match = buildPatternContext("AH", [
    selection({
      marketType: "handicap",
      marketFamily: "asianHandicap",
      side: "home",
      odds: 0.79,
      line: -0.5,
      impliedProbability: 0.62,
    }),
    selection({
      marketType: "handicap",
      marketFamily: "asianHandicap",
      side: "away",
      odds: 0.95,
      line: 0.5,
      impliedProbability: 0.48,
    }),
  ]);
  const noMatch = buildPatternContext("AH", [
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

  assertPatternMatch("TrapCandidate", match);
  assertPatternNoMatch("TrapCandidate", noMatch);
}

function testPatternEngine(): void {
  const selections = [
    selection({
      marketType: "handicap",
      marketFamily: "asianHandicap",
      side: "home",
      odds: 0.79,
      line: -0.5,
      impliedProbability: 0.558,
    }),
    selection({
      marketType: "handicap",
      marketFamily: "asianHandicap",
      side: "away",
      odds: 0.81,
      line: 0.5,
      impliedProbability: 0.549,
    }),
  ];

  const oddsContext = evaluateMarketOddsRules(selections);
  const ruleEngineResult = runMarketRuleEngine({
    marketType: "AH",
    selections,
    oddsContext,
  });

  const context = buildPatternContext("AH", selections);
  const patternResult = runMarketPatternEngine(
    context,
    ruleEngineResult.scoreAfterRules,
    ruleEngineResult.scoreBreakdown
  );

  assert(patternResult.matchedPatterns.length > 0, "pattern engine matches");
  assert(
    patternResult.matchedPatterns.some((pattern) => pattern.id === "HomeLowWaterBalanced"),
    "HomeLowWaterBalanced matched"
  );
  assert(patternResult.patternAdjustment > 0, "positive pattern adjustment");
  assert(patternResult.finalScore > ruleEngineResult.scoreAfterRules, "final score includes patterns");
  assert(
    patternResult.scoreBreakdown.some((entry) => entry.step === "Final"),
    "final breakdown step"
  );
}

function testPatternAudit(): void {
  const context = buildPatternContext("AH", [
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

  const ruleEngineResult = runMarketRuleEngine({
    marketType: "AH",
    selections: context.selections,
    oddsContext: context.oddsContext,
  });

  const patternResult = runMarketPatternEngine(
    context,
    ruleEngineResult.scoreAfterRules,
    ruleEngineResult.scoreBreakdown
  );

  assert(patternResult.patternAudit.length === 10, "audit covers all patterns");
  assert(
    patternResult.patternAudit.some(
      (entry) => entry.patternId === "BalancedFavorite" && entry.matched
    ),
    "audit records matched pattern"
  );
  assert(
    patternResult.patternAudit.some(
      (entry) => entry.patternId === "TrapCandidate" && !entry.matched
    ),
    "audit records unmatched pattern"
  );
}

function testPatternHistoryInterface(): void {
  const provider = createNotImplementedMarketHistoryProvider();
  const pattern = provider.getPatternHistoricalPattern({
    patternId: "HomeLowWaterBalanced",
  });

  assert(pattern.status === "notImplemented", "pattern history not implemented");
  assert(pattern.patternId === "HomeLowWaterBalanced", "pattern history id");
  assert(pattern.sampleSize === null, "pattern history sampleSize null");
}

function testScoreBreakdownExample(): void {
  const selections = [
    selection({
      marketType: "handicap",
      marketFamily: "asianHandicap",
      side: "home",
      odds: 0.79,
      line: -0.5,
      impliedProbability: 0.558,
    }),
    selection({
      marketType: "handicap",
      marketFamily: "asianHandicap",
      side: "away",
      odds: 0.81,
      line: 0.5,
      impliedProbability: 0.549,
    }),
  ];

  const oddsContext = evaluateMarketOddsRules(selections);
  const ruleEngineResult = runMarketRuleEngine({
    marketType: "AH",
    selections,
    oddsContext,
  });
  const context = buildPatternContext("AH", selections);
  const patternResult = runMarketPatternEngine(
    context,
    ruleEngineResult.scoreAfterRules,
    ruleEngineResult.scoreBreakdown
  );

  assert(ruleEngineResult.baseScore === MARKET_ENGINE_BASE_SCORE, "base score 65");
  assert(patternResult.finalScore >= ruleEngineResult.scoreAfterRules, "patterns add score");
}

export function runMarketPatternsTests(): void {
  testPatternRegistry();
  testHomeLowWaterBalanced();
  testHomeLowWaterFavorite();
  testAwayHighWaterValue();
  testBalancedFavorite();
  testBalancedUnderdog();
  testExtremeFavorite();
  testExtremeUnderdog();
  testLowOverroundBalanced();
  testHighOverroundRisk();
  testTrapCandidate();
  testPatternEngine();
  testPatternAudit();
  testPatternHistoryInterface();
  testScoreBreakdownExample();
}
