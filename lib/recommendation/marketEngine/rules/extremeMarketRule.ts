import { createRuleSignal } from "./ruleHelpers";
import type { MarketRule, MarketRuleContext } from "./ruleTypes";

export const ExtremeMarketRule: MarketRule = {
  id: "ExtremeMarketRule",
  name: "Extreme Favorite",
  evaluate(context: MarketRuleContext) {
    const triggered = context.oddsContext.isExtreme;

    return createRuleSignal({
      id: "ExtremeMarketRule",
      name: "Extreme Favorite",
      marketType: context.marketType,
      scoreAdjustment: triggered ? -5 : 0,
      confidenceAdjustment: triggered ? -0.05 : 0,
      severity: triggered ? "warning" : "info",
      triggered,
      reason: triggered
        ? "Market shows extreme favorite pricing."
        : "No extreme market pricing detected.",
      metadata: {
        impliedProbDiff: context.oddsContext.impliedProbDiff,
        pattern: context.oddsContext.pattern,
      },
    });
  },
};
