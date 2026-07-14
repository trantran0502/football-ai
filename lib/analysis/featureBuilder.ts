import { convertRawOddsToImpliedProbability } from "@/lib/analysis/featureScore/oddsConversion";
import type {
  AnalysisFeature,
  MarketId,
  MarketSelectionInput,
} from "@/lib/analysis/types";
import type { MarketSelection } from "@/types/match";

export function buildMarketId(selection: MarketSelection): MarketId {
  return `${selection.marketType}::${selection.title}::${selection.period}`;
}

function resolveImpliedProbability(selection: MarketSelection): number {
  const fromOdds = convertRawOddsToImpliedProbability(selection.odds);
  if (fromOdds !== null) {
    return fromOdds;
  }

  if (
    selection.impliedProbability !== undefined &&
    Number.isFinite(selection.impliedProbability) &&
    selection.impliedProbability >= 0 &&
    selection.impliedProbability <= 1
  ) {
    return selection.impliedProbability;
  }

  return 0;
}

function resolveSettlement(
  selection: MarketSelection
): AnalysisFeature["settlement"] {
  return selection.boundarySettlement ?? null;
}

/**
 * 將 marketSelections 轉為分析特徵，不做評分。
 */
export function buildAnalysisFeatures(
  marketSelections: MarketSelectionInput
): AnalysisFeature[] {
  return marketSelections.map((selection) => ({
    marketId: buildMarketId(selection),
    marketType: selection.marketType,
    marketFamily: selection.marketFamily,
    title: selection.title,
    period: selection.period,
    side: selection.side,
    decimalOdds: selection.odds,
    impliedProbability: resolveImpliedProbability(selection),
    line: selection.line,
    modifier: selection.modifier,
    settlement: resolveSettlement(selection),
    handicap: selection.handicap ?? null,
    rawLine: selection.rawLine,
    label: selection.label,
  }));
}
