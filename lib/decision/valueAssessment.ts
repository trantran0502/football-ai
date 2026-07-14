import { buildMarketKey } from "@/lib/betting/marketAnalyzer";
import type { BettingIntelligenceResult } from "@/lib/betting/intelligenceTypes";
import type { RecommendationCandidate } from "@/lib/recommendation/recommendationTypes";
import type { ValueAssessmentResult } from "@/lib/decision/decisionTypes";

const VALUE_RATING_SCORE: Record<string, number> = {
  none: 0,
  low: 25,
  medium: 50,
  high: 75,
  strong: 95,
};

export function assessValueForCandidate(
  candidate: RecommendationCandidate,
  intelligence: BettingIntelligenceResult | null
): ValueAssessmentResult {
  const marketKey = buildMarketKey(candidate.selection);
  const intelSelection = intelligence?.selections.find(
    (item) => item.marketKey === marketKey
  );
  const valueBet = intelSelection?.valueBet;

  const expectedValue = valueBet?.expectedValue ?? candidate.expectedValue;
  const fairOdds = valueBet?.fairOdds ?? null;
  const edge = valueBet?.edge ?? 0;
  const kellyFraction = valueBet?.kellyFraction ?? 0;
  const closingLineValue = valueBet?.closingLineValue ?? null;
  const valueRating = valueBet?.valueRating ?? "none";

  const ratingScore = VALUE_RATING_SCORE[valueRating] ?? 0;
  const evScore = Math.min(100, Math.max(0, expectedValue * 500));
  const kellyScore = Math.min(100, kellyFraction * 200);
  const clvScore =
    closingLineValue !== null
      ? Math.min(100, Math.max(0, closingLineValue * 400 + 50))
      : 40;

  const valueScore = evScore * 0.45 + ratingScore * 0.25 + kellyScore * 0.15 + clvScore * 0.15;

  const reasons: string[] = [];
  if (expectedValue > 0) {
    reasons.push(`Positive EV ${(expectedValue * 100).toFixed(1)}%`);
  }
  if (fairOdds !== null) {
    reasons.push(`Fair odds ${fairOdds.toFixed(2)} vs market ${candidate.selection.odds}`);
  }
  if (edge > 0) {
    reasons.push(`Edge ${(edge * 100).toFixed(1)}%`);
  }
  if (valueRating !== "none") {
    reasons.push(`Value rating: ${valueRating}`);
  }
  if (closingLineValue !== null && closingLineValue > 0) {
    reasons.push(`CLV projection ${(closingLineValue * 100).toFixed(1)}%`);
  }

  return {
    valueScore,
    expectedValue,
    fairOdds,
    edge,
    kellyFraction,
    closingLineValue,
    valueRating,
    reasons,
  };
}

export function assessAggregateValue(
  intelligence: BettingIntelligenceResult | null
): number {
  if (!intelligence) {
    return 0;
  }
  const signal = intelligence.signals.find((item) => item.id === "value_signal");
  return signal?.score ?? intelligence.summary.averageExpectedValue * 500;
}
