import type { MarketSelection } from "@/types/match";
import type { MarketHistoryProvider } from "../marketHistoryProvider";
import type {
  MarketAnalysis,
  MarketEngineType,
  MarketRecommendation,
} from "../marketEngineTypes";
import { evaluateMarketOddsRules } from "../marketOddsRules";
import {
  computeMarketScore,
  deriveRiskLevel,
  scoreToConfidence,
} from "../marketScore";

export function groupSelectionsByLine(
  selections: MarketSelection[]
): Map<string, MarketSelection[]> {
  const groups = new Map<string, MarketSelection[]>();

  for (const selection of selections) {
    const key = `${selection.period}|${selection.line ?? "null"}`;
    const list = groups.get(key) ?? [];
    list.push(selection);
    groups.set(key, list);
  }

  return groups;
}

export function pickPrimaryMarketGroup(
  selections: MarketSelection[]
): MarketSelection[] {
  const groups = [...groupSelectionsByLine(selections).values()];
  if (groups.length === 0) {
    return [];
  }

  return groups.sort((left, right) => right.length - left.length)[0];
}

export function buildMarketAnalysis(
  marketType: MarketEngineType,
  selections: MarketSelection[],
  historyProvider: MarketHistoryProvider,
  recommendationBuilder: (
    selections: MarketSelection[],
    rules: ReturnType<typeof evaluateMarketOddsRules>
  ) => MarketRecommendation
): MarketAnalysis | null {
  const group = pickPrimaryMarketGroup(selections);
  if (group.length === 0) {
    return null;
  }

  const rules = evaluateMarketOddsRules(group);
  if (rules.selections.length === 0) {
    return null;
  }

  const marketScore = computeMarketScore(rules.scoreInput);
  const confidence = scoreToConfidence(marketScore);
  const historical = historyProvider.getHistoricalPattern({
    marketType,
    line: group[0]?.line ?? null,
    period: group[0]?.period,
  });

  const reasons: string[] = [
    `Current market pattern: ${rules.pattern}.`,
    `Water level: ${rules.waterLevel}.`,
  ];

  if (rules.oddsDiff !== null) {
    reasons.push(`Odds difference between sides: ${rules.oddsDiff.toFixed(3)}.`);
  }
  if (rules.impliedProbDiff !== null) {
    reasons.push(
      `Implied probability gap: ${(rules.impliedProbDiff * 100).toFixed(1)}%.`
    );
  }
  if (rules.isBalanced) {
    reasons.push("Market looks balanced.");
  }
  if (rules.isExtreme) {
    reasons.push("Market shows extreme pricing.");
  }
  if (rules.isTrapSuspected) {
    reasons.push("Trap pattern rule triggered (placeholder rule).");
  }

  return {
    marketType,
    confidence,
    marketScore,
    historicalConfidence: historical.confidence,
    historicalSample: historical.sampleSize,
    recommendation: recommendationBuilder(group, rules),
    reasons,
    signals: rules.signals,
    riskLevel: deriveRiskLevel(marketScore),
    line: group[0]?.line ?? null,
    period: group[0]?.period ?? "full",
  };
}
