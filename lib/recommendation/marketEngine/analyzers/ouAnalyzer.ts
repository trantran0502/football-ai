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

export const OUAnalyzer: MarketAnalyzer = {
  marketType: "O/U",
  analyze(selections: MarketSelection[], historyProvider: MarketHistoryProvider): MarketAnalysis | null {
    const ouSelections = selections.filter(
      (selection) =>
        selection.marketType === "totalGoals" &&
        selection.marketFamily === "asianOverUnder"
    );

    return buildMarketAnalysis("O/U", ouSelections, historyProvider, (group, rules) => {
      if (rules.isExtreme) {
        return { action: "avoid", side: null, label: "Avoid O/U (extreme pricing)" };
      }

      const lean = pickLeanSide(group);
      if (!lean) {
        return { action: "pass", side: null, label: "No O/U lean" };
      }

      return {
        action: "lean",
        side: lean.side,
        label: `Lean ${lean.side} ${lean.line ?? ""}`.trim(),
      };
    });
  },
};
