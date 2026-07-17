import type { MarketRuleSignal } from "../rules/ruleTypes";
import type { PatternMatchContext } from "./patternTypes";

export function isRuleTriggered(
  ruleResults: MarketRuleSignal[],
  ruleId: string
): boolean {
  return ruleResults.find((rule) => rule.id === ruleId)?.triggered ?? false;
}

export function getTriggeredRuleIds(ruleResults: MarketRuleSignal[]): string[] {
  return ruleResults.filter((rule) => rule.triggered).map((rule) => rule.id);
}

export function sumRequiredRuleScores(
  ruleResults: MarketRuleSignal[],
  requiredRules: string[]
): number {
  return requiredRules.reduce((sum, ruleId) => {
    const rule = ruleResults.find((item) => item.id === ruleId);
    return sum + (rule?.triggered ? rule.scoreAdjustment : 0);
  }, 0);
}

export function findSideInsight(context: PatternMatchContext, side: string) {
  return context.oddsContext.selections.find((item) => item.side === side);
}

export function findFavoriteSide(context: PatternMatchContext): string | null {
  const sorted = [...context.oddsContext.selections].sort(
    (left, right) => right.impliedProbability - left.impliedProbability
  );
  return sorted[0]?.side ?? null;
}

export function findUnderdogSide(context: PatternMatchContext): string | null {
  const sorted = [...context.oddsContext.selections].sort(
    (left, right) => left.impliedProbability - right.impliedProbability
  );
  return sorted[0]?.side ?? null;
}

export function hasLowWaterOnSide(context: PatternMatchContext, side: string): boolean {
  const insight = findSideInsight(context, side);
  return insight?.waterLevel === "low";
}

export function hasHighWaterOnSide(context: PatternMatchContext, side: string): boolean {
  const insight = findSideInsight(context, side);
  return insight?.waterLevel === "high";
}

export function requiredRulesTriggered(
  context: PatternMatchContext,
  requiredRules: string[]
): boolean {
  return requiredRules.every((ruleId) => isRuleTriggered(context.ruleResults, ruleId));
}

export function collectMatchedRules(
  context: PatternMatchContext,
  requiredRules: string[],
  optionalRules: string[]
): string[] {
  const matched = requiredRules.filter((ruleId) =>
    isRuleTriggered(context.ruleResults, ruleId)
  );
  for (const ruleId of optionalRules) {
    if (isRuleTriggered(context.ruleResults, ruleId)) {
      matched.push(ruleId);
    }
  }
  return matched;
}
