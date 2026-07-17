import { createRuleSignal } from "./ruleHelpers";
import type { MarketRule, MarketRuleContext } from "./ruleTypes";

export const SteamMoveRule: MarketRule = {
  id: "SteamMoveRule",
  name: "Steam Move",
  evaluate(context: MarketRuleContext) {
    return createRuleSignal({
      id: "SteamMoveRule",
      name: "Steam Move",
      marketType: context.marketType,
      scoreAdjustment: 0,
      confidenceAdjustment: 0,
      severity: "info",
      triggered: false,
      reason: "Placeholder - steam move detection not implemented.",
      metadata: {
        placeholder: true,
      },
    });
  },
};
