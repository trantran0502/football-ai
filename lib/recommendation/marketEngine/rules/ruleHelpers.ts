import type { MarketRuleContext, MarketRuleSignal } from "./ruleTypes";

export function createRuleSignal(
  partial: Pick<
    MarketRuleSignal,
    "id" | "name" | "marketType" | "scoreAdjustment" | "confidenceAdjustment" | "severity" | "reason" | "triggered"
  > & { metadata?: MarketRuleSignal["metadata"] }
): MarketRuleSignal {
  return {
    metadata: {},
    ...partial,
  };
}

export function findLowestWaterSide(context: MarketRuleContext) {
  return [...context.oddsContext.selections].sort(
    (left, right) => left.rawOdds - right.rawOdds
  )[0];
}

export function findHighestImpliedSide(context: MarketRuleContext) {
  return [...context.oddsContext.selections].sort(
    (left, right) => right.impliedProbability - left.impliedProbability
  )[0];
}

export function findLowestImpliedSide(context: MarketRuleContext) {
  return [...context.oddsContext.selections].sort(
    (left, right) => left.impliedProbability - right.impliedProbability
  )[0];
}

export function hasLowWater(context: MarketRuleContext): boolean {
  return context.oddsContext.selections.some((item) => item.waterLevel === "low");
}

export function hasHighWater(context: MarketRuleContext): boolean {
  return context.oddsContext.selections.some((item) => item.waterLevel === "high");
}
