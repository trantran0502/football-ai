import { createRuleSignal } from "./ruleHelpers";
import type { MarketRule, MarketRuleContext } from "./ruleTypes";

const LARGE_GAP = 0.12;
const MODERATE_GAP = 0.06;

export const OddsGapRule: MarketRule = {
  id: "OddsGapRule",
  name: "Odds Gap",
  evaluate(context: MarketRuleContext) {
    const oddsDiff = context.oddsContext.oddsDiff;
    const triggered = oddsDiff !== null && oddsDiff >= MODERATE_GAP;

    let scoreAdjustment = 0;
    let reason = "Odds gap is narrow.";

    if (oddsDiff !== null && oddsDiff >= LARGE_GAP) {
      scoreAdjustment = -2;
      reason = `Large odds gap detected: ${oddsDiff.toFixed(3)}.`;
    } else if (oddsDiff !== null && oddsDiff >= MODERATE_GAP) {
      scoreAdjustment = 1;
      reason = `Moderate odds gap detected: ${oddsDiff.toFixed(3)}.`;
    }

    return createRuleSignal({
      id: "OddsGapRule",
      name: "Odds Gap",
      marketType: context.marketType,
      scoreAdjustment: triggered ? scoreAdjustment : 0,
      confidenceAdjustment: triggered ? scoreAdjustment / 100 : 0,
      severity: oddsDiff !== null && oddsDiff >= LARGE_GAP ? "warning" : "info",
      triggered,
      reason,
      metadata: {
        oddsDiff,
      },
    });
  },
};
