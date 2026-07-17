import { createRuleSignal, hasHighWater } from "./ruleHelpers";
import type { MarketRule, MarketRuleContext } from "./ruleTypes";

export const HighWaterRule: MarketRule = {
  id: "HighWaterRule",
  name: "High Water",
  evaluate(context: MarketRuleContext) {
    const highSides = context.oddsContext.selections.filter(
      (item) => item.waterLevel === "high"
    );
    const triggered = hasHighWater(context);
    const side = highSides[0];

    return createRuleSignal({
      id: "HighWaterRule",
      name: "High Water",
      marketType: context.marketType,
      scoreAdjustment: triggered ? 2 : 0,
      confidenceAdjustment: triggered ? 0.02 : 0,
      severity: triggered ? "info" : "info",
      triggered,
      reason: triggered
        ? `${capitalizeSide(side?.side ?? "side")} Water = ${side?.rawOdds.toFixed(2) ?? "n/a"}`
        : "No high-water side detected.",
      metadata: {
        side: side?.side ?? null,
        water: side?.rawOdds ?? null,
      },
    });
  },
};

function capitalizeSide(side: string): string {
  return side.charAt(0).toUpperCase() + side.slice(1);
}
