import { createRuleSignal } from "./ruleHelpers";
import type { MarketRule, MarketRuleContext } from "./ruleTypes";

export const TrapLineRule: MarketRule = {
  id: "TrapLineRule",
  name: "Trap Line",
  evaluate(context: MarketRuleContext) {
    const triggered = context.oddsContext.isTrapSuspected;

    return createRuleSignal({
      id: "TrapLineRule",
      name: "Trap Line",
      marketType: context.marketType,
      scoreAdjustment: triggered ? -6 : 0,
      confidenceAdjustment: triggered ? -0.06 : 0,
      severity: triggered ? "critical" : "info",
      triggered,
      reason: triggered
        ? "Trap line pattern detected (placeholder rule)."
        : "No trap line pattern detected.",
      metadata: {
        pattern: context.oddsContext.pattern,
        placeholder: !triggered,
      },
    });
  },
};
