import { createRuleSignal } from "./ruleHelpers";
import type { MarketRule, MarketRuleContext } from "./ruleTypes";

const HIGH_OVERROUND = 0.06;
const LOW_OVERROUND = 0.03;

export const OverroundRule: MarketRule = {
  id: "OverroundRule",
  name: "Overround",
  evaluate(context: MarketRuleContext) {
    const overround = context.oddsContext.overround;
    const triggered =
      overround !== null &&
      (overround >= HIGH_OVERROUND || overround <= LOW_OVERROUND);

    let scoreAdjustment = 0;
    let reason = "Overround within normal range.";

    if (overround !== null && overround >= HIGH_OVERROUND) {
      scoreAdjustment = -3;
      reason = `High overround detected: ${(overround * 100).toFixed(2)}%.`;
    } else if (overround !== null && overround <= LOW_OVERROUND) {
      scoreAdjustment = 2;
      reason = `Low overround detected: ${(overround * 100).toFixed(2)}%.`;
    }

    return createRuleSignal({
      id: "OverroundRule",
      name: "Overround",
      marketType: context.marketType,
      scoreAdjustment: triggered ? scoreAdjustment : 0,
      confidenceAdjustment: triggered ? scoreAdjustment / 100 : 0,
      severity: overround !== null && overround >= HIGH_OVERROUND ? "warning" : "info",
      triggered,
      reason,
      metadata: {
        overround,
      },
    });
  },
};
