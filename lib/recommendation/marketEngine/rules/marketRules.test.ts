import type { MarketSelection } from "@/types/match";
import { evaluateMarketOddsRules } from "../marketOddsRules";
import { BalancedMarketRule } from "./balancedMarketRule";
import { ExtremeMarketRule } from "./extremeMarketRule";
import { FavoriteBiasRule } from "./favoriteBiasRule";
import { HighWaterRule } from "./highWaterRule";
import { LowWaterRule } from "./lowWaterRule";
import { OddsGapRule } from "./oddsGapRule";
import { OverroundRule } from "./overroundRule";
import { runMarketRuleEngine } from "./ruleEngine";
import { MARKET_RULE_REGISTRY, listMarketRuleIds } from "./ruleRegistry";
import type { MarketRuleContext } from "./ruleTypes";
import { SharpMoneyRule } from "./sharpMoneyRule";
import { SteamMoveRule } from "./steamMoveRule";
import { TrapLineRule } from "./trapLineRule";
import { UnderdogValueRule } from "./underdogValueRule";
import { createNotImplementedMarketHistoryProvider } from "../marketHistoryProvider";
import { MARKET_ENGINE_BASE_SCORE } from "../marketScore";

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

function buildContext(
  marketType: MarketRuleContext["marketType"],
  selections: MarketSelection[]
): MarketRuleContext {
  return {
    marketType,
    selections,
    oddsContext: evaluateMarketOddsRules(selections),
  };
}

function assertRuleTrigger(
  ruleId: string,
  context: MarketRuleContext,
  expectedTriggered: boolean
): void {
  const rule = MARKET_RULE_REGISTRY.find((item) => item.id === ruleId);
  assert(rule !== undefined, `${ruleId} exists in registry`);
  const result = rule!.evaluate(context);
  assert(result.triggered === expectedTriggered, `${ruleId} triggered=${expectedTriggered}`);
}

function testRuleRegistry(): void {
  assert(MARKET_RULE_REGISTRY.length === 11, "registry has 11 rules");
  assert(listMarketRuleIds().includes("LowWaterRule"), "registry includes LowWaterRule");
  assert(listMarketRuleIds().includes("TrapLineRule"), "registry includes TrapLineRule");
}

function testLowWaterRule(): void {
  const trigger = buildContext("AH", [
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
  const noTrigger = buildContext("AH", [
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

  assertRuleTrigger("LowWaterRule", trigger, true);
  assertRuleTrigger("LowWaterRule", noTrigger, false);
  const triggered = LowWaterRule.evaluate(trigger);
  assert(triggered.scoreAdjustment === 4, "LowWaterRule +4");
  assert(triggered.reason.includes("0.79"), "LowWaterRule reason");
}

function testHighWaterRule(): void {
  const trigger = buildContext("O/U", [
    selection({
      marketType: "totalGoals",
      marketFamily: "asianOverUnder",
      side: "over",
      odds: 0.99,
      line: 2.5,
      impliedProbability: 0.502,
    }),
    selection({
      marketType: "totalGoals",
      marketFamily: "asianOverUnder",
      side: "under",
      odds: 0.75,
      line: 2.5,
      impliedProbability: 0.571,
    }),
  ]);
  const noTrigger = buildContext("O/U", [
    selection({
      marketType: "totalGoals",
      marketFamily: "asianOverUnder",
      side: "over",
      odds: 0.9,
      line: 2.5,
      impliedProbability: 0.526,
    }),
    selection({
      marketType: "totalGoals",
      marketFamily: "asianOverUnder",
      side: "under",
      odds: 0.92,
      line: 2.5,
      impliedProbability: 0.515,
    }),
  ]);

  assertRuleTrigger("HighWaterRule", trigger, true);
  assertRuleTrigger("HighWaterRule", noTrigger, false);
  assert(HighWaterRule.evaluate(trigger).scoreAdjustment === 2, "HighWaterRule +2");
}

function testBalancedMarketRule(): void {
  const trigger = buildContext("AH", [
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
  const noTrigger = buildContext("AH", [
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

  assertRuleTrigger("BalancedMarketRule", trigger, true);
  assertRuleTrigger("BalancedMarketRule", noTrigger, false);
  assert(BalancedMarketRule.evaluate(trigger).scoreAdjustment === 3, "BalancedMarketRule +3");
}

function testExtremeMarketRule(): void {
  const trigger = buildContext("1X2", [
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
  const noTrigger = buildContext("1X2", [
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

  assertRuleTrigger("ExtremeMarketRule", trigger, true);
  assertRuleTrigger("ExtremeMarketRule", noTrigger, false);
  assert(ExtremeMarketRule.evaluate(trigger).scoreAdjustment === -5, "ExtremeMarketRule -5");
}

function testOverroundRule(): void {
  const highOverround = buildContext("BTTS", [
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
  const normal = buildContext("BTTS", [
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

  assert(OverroundRule.evaluate(highOverround).triggered, "OverroundRule high triggered");
  assert(OverroundRule.evaluate(highOverround).scoreAdjustment === -3, "OverroundRule high -3");
  assert(!OverroundRule.evaluate(normal).triggered, "OverroundRule normal not triggered");
}

function testFavoriteBiasRule(): void {
  const trigger = buildContext("AH", [
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
  const noTrigger = buildContext("AH", [
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

  assertRuleTrigger("FavoriteBiasRule", trigger, true);
  assertRuleTrigger("FavoriteBiasRule", noTrigger, false);
  assert(FavoriteBiasRule.evaluate(trigger).scoreAdjustment === -4, "FavoriteBiasRule -4");
}

function testUnderdogValueRule(): void {
  const trigger = buildContext("1X2", [
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
  const noTrigger = buildContext("1X2", [
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

  assertRuleTrigger("UnderdogValueRule", trigger, true);
  assertRuleTrigger("UnderdogValueRule", noTrigger, false);
  assert(UnderdogValueRule.evaluate(trigger).scoreAdjustment === 3, "UnderdogValueRule +3");
}

function testOddsGapRule(): void {
  const trigger = buildContext("AH", [
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
  const noTrigger = buildContext("AH", [
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

  assertRuleTrigger("OddsGapRule", trigger, true);
  assertRuleTrigger("OddsGapRule", noTrigger, false);
}

function testPlaceholderRules(): void {
  const context = buildContext("AH", [
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

  for (const rule of [SteamMoveRule, SharpMoneyRule]) {
    const result = rule.evaluate(context);
    assert(!result.triggered, `${rule.id} placeholder not triggered`);
    assert(result.scoreAdjustment === 0, `${rule.id} placeholder score 0`);
  }

  assert(!TrapLineRule.evaluate(context).triggered, "TrapLineRule not triggered on balanced");
}

function testTrapLineRule(): void {
  const trigger = buildContext("AH", [
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

  assertRuleTrigger("TrapLineRule", trigger, true);
  assert(TrapLineRule.evaluate(trigger).scoreAdjustment === -6, "TrapLineRule -6");
}

function testRuleEngineScoreBreakdown(): void {
  const context = buildContext("AH", [
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

  const result = runMarketRuleEngine(context);
  assert(result.baseScore === MARKET_ENGINE_BASE_SCORE, "base score 65");
  assert(result.scoreBreakdown[0]?.step === "Base Score", "first breakdown step");
  assert(result.scoreBreakdown.some((entry) => entry.step === "Balanced Market"), "balanced in breakdown");
  assert(result.finalScore >= result.baseScore, "final score computed");
  assert(result.auditLog.length === MARKET_RULE_REGISTRY.length, "audit for all rules");
  assert(
    result.auditLog.some((entry) => entry.ruleId === "BalancedMarketRule" && entry.triggered),
    "audit includes triggered balanced rule"
  );
  assert(result.scoreAfterRules >= result.baseScore, "score after rules computed");
}

function testRuleHistoricalInterface(): void {
  const provider = createNotImplementedMarketHistoryProvider();
  const pattern = provider.getRuleHistoricalPattern({ ruleId: "LowWaterRule" });

  assert(pattern.status === "notImplemented", "rule historical not implemented");
  assert(pattern.ruleId === "LowWaterRule", "rule historical ruleId");
  assert(pattern.sampleSize === null, "rule historical sampleSize null");
}

export function runMarketRulesTests(): void {
  testRuleRegistry();
  testLowWaterRule();
  testHighWaterRule();
  testBalancedMarketRule();
  testExtremeMarketRule();
  testOverroundRule();
  testFavoriteBiasRule();
  testUnderdogValueRule();
  testOddsGapRule();
  testPlaceholderRules();
  testTrapLineRule();
  testRuleEngineScoreBreakdown();
  testRuleHistoricalInterface();
}
