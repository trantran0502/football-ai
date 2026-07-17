import { createRuleSignal, findLowestImpliedSide } from "./ruleHelpers";
import type { MarketRule, MarketRuleContext } from "./ruleTypes";

export const UnderdogValueRule: MarketRule = {
  id: "UnderdogValueRule",
  name: "Underdog Value",
  evaluate(context: MarketRuleContext) {
    const underdog = findLowestImpliedSide(context);
    const triggered =
      underdog !== undefined &&
      (underdog.waterLevel === "high" || underdog.decimalOdds >= 2.2);

    return createRuleSignal({
      id: "UnderdogValueRule",
      name: "Underdog Value",
      marketType: context.marketType,
      scoreAdjustment: triggered ? 3 : 0,
      confidenceAdjustment: triggered ? 0.03 : 0,
      severity: triggered ? "info" : "info",
      triggered,
      reason: triggered
        ? `Underdog ${underdog.side} shows value at ${underdog.rawOdds.toFixed(2)}.`
        : "No underdog value detected.",
      metadata: {
        underdogSide: underdog?.side ?? null,
        underdogOdds: underdog?.rawOdds ?? null,
        underdogImplied: underdog?.impliedProbability ?? null,
      },
    });
  },
};
