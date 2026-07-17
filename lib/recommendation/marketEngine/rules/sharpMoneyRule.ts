import { createRuleSignal } from "./ruleHelpers";
import type { MarketRule, MarketRuleContext } from "./ruleTypes";

export const SharpMoneyRule: MarketRule = {
  id: "SharpMoneyRule",
  name: "Sharp Money",
  evaluate(context: MarketRuleContext) {
    return createRuleSignal({
      id: "SharpMoneyRule",
      name: "Sharp Money",
      marketType: context.marketType,
      scoreAdjustment: 0,
      confidenceAdjustment: 0,
      severity: "info",
      triggered: false,
      reason: "Placeholder - sharp money detection not implemented.",
      metadata: {
        placeholder: true,
      },
    });
  },
};
