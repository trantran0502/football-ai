import type { MarketSelection } from "@/types/match";
import type { MarketHistoryProvider } from "../marketHistoryProvider";
import type { MarketAnalysis, MarketAnalyzer } from "../marketEngineTypes";
import { buildMarketAnalysis } from "./analyzerUtils";

function pickLeanSide(selections: MarketSelection[]): MarketSelection | null {
  let best: MarketSelection | null = null;
  let bestImplied = -1;

  for (const selection of selections) {
    const implied = selection.impliedProbability ?? 0;
    if (implied > bestImplied) {
      bestImplied = implied;
      best = selection;
    }
  }

  return best;
}

export const BTTSAnalyzer: MarketAnalyzer = {
  marketType: "BTTS",
  analyze(selections: MarketSelection[], historyProvider: MarketHistoryProvider): MarketAnalysis | null {
    const bttsSelections = selections.filter(
      (selection) => selection.marketType === "btts"
    );

    return buildMarketAnalysis("BTTS", bttsSelections, historyProvider, (group, rules) => {
      const lean = pickLeanSide(group);
      if (!lean) {
        return { action: "pass", side: null, label: "No BTTS lean" };
      }

      if (rules.isBalanced) {
        return {
          action: "lean",
          side: lean.side,
          label: `Lean BTTS ${lean.side}`,
        };
      }

      return {
        action: "lean",
        side: lean.side,
        label: `Lean BTTS ${lean.side}`,
      };
    });
  },
};
