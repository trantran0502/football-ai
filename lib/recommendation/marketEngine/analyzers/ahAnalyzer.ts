import type { MarketSelection } from "@/types/match";
import type { MarketHistoryProvider } from "../marketHistoryProvider";
import type { MarketAnalysis, MarketAnalyzer } from "../marketEngineTypes";
import { buildMarketAnalysis } from "./analyzerUtils";

function pickLeanSide(
  selections: MarketSelection[]
): MarketSelection | null {
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

export const AHAnalyzer: MarketAnalyzer = {
  marketType: "AH",
  analyze(selections: MarketSelection[], historyProvider: MarketHistoryProvider): MarketAnalysis | null {
    const ahSelections = selections.filter(
      (selection) =>
        selection.marketType === "handicap" &&
        selection.marketFamily === "asianHandicap"
    );

    return buildMarketAnalysis("AH", ahSelections, historyProvider, (group, rules) => {
      if (rules.isTrapSuspected) {
        return { action: "avoid", side: null, label: "Avoid AH (trap rule)" };
      }

      const lean = pickLeanSide(group);
      if (!lean) {
        return { action: "pass", side: null, label: "No AH lean" };
      }

      return {
        action: "lean",
        side: lean.side,
        label: `Lean ${lean.side} ${lean.line ?? ""}`.trim(),
      };
    });
  },
};
