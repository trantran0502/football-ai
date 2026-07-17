import { createRuleSignal } from "./ruleHelpers";
import type { MarketRule, MarketRuleContext } from "./ruleTypes";

export const BalancedMarketRule: MarketRule = {
  id: "BalancedMarketRule",
  name: "Balanced Market",
  evaluate(context: MarketRuleContext) {
    const triggered = context.oddsContext.isBalanced;

    return createRuleSignal({
      id: "BalancedMarketRule",
      name: "Balanced Market",
      marketType: context.marketType,
      scoreAdjustment: triggered ? 3 : 0,
      confidenceAdjustment: triggered ? 0.03 : 0,
      severity: "info",
      triggered,
      reason: triggered
        ? "Market odds are balanced between sides."
        : "Market is not balanced.",
      metadata: {
        oddsDiff: context.oddsContext.oddsDiff,
        pattern: context.oddsContext.pattern,
      },
    });
  },
};
