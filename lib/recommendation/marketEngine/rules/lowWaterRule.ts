import {
  createRuleSignal,
  findLowestWaterSide,
  hasLowWater,
} from "./ruleHelpers";
import type { MarketRule, MarketRuleContext } from "./ruleTypes";

export const LowWaterRule: MarketRule = {
  id: "LowWaterRule",
  name: "Low Water",
  evaluate(context: MarketRuleContext) {
    const triggered = hasLowWater(context);
    const lowest = findLowestWaterSide(context);

    return createRuleSignal({
      id: "LowWaterRule",
      name: "Low Water",
      marketType: context.marketType,
      scoreAdjustment: triggered ? 4 : 0,
      confidenceAdjustment: triggered ? 0.04 : 0,
      severity: triggered ? "info" : "info",
      triggered,
      reason: triggered
        ? `${capitalizeSide(lowest?.side ?? "side")} Water = ${lowest?.rawOdds.toFixed(2) ?? "n/a"}`
        : "No low-water side detected.",
      metadata: {
        side: lowest?.side ?? null,
        water: lowest?.rawOdds ?? null,
      },
    });
  },
};

function capitalizeSide(side: string): string {
  return side.charAt(0).toUpperCase() + side.slice(1);
}
