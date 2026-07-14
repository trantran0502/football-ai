import { getActionableRecommendations } from "@/lib/recommendation/recommendationPresentation";
import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import type { BettingIntelligenceResult } from "@/lib/betting/intelligenceTypes";
import {
  computeDecisionScore,
  computePredictionScore,
  normalizeScore,
} from "@/lib/decision/decisionScoring";
import type {
  RecommendationCandidate,
  RecommendationEngineResult,
} from "@/lib/recommendation/recommendationTypes";
import { assessRisk } from "@/lib/decision/riskAssessment";
import { assessValueForCandidate } from "@/lib/decision/valueAssessment";
import type { ScoredMarketCandidate } from "@/lib/decision/decisionTypes";

export function scoreMarketCandidates(input: {
  candidates: RecommendationCandidate[];
  fusion: FeatureFusionResult | null;
  bettingIntelligence: BettingIntelligenceResult | null;
}): ScoredMarketCandidate[] {
  const predictionScore = input.fusion
    ? computePredictionScore(
        input.fusion.overallScore,
        input.fusion.overallConfidence
      )
    : 0;

  return input.candidates.map((candidate) => {
    const value = assessValueForCandidate(candidate, input.bettingIntelligence);
    const risk = assessRisk({
      fusion: input.fusion,
      bettingIntelligence: input.bettingIntelligence,
      candidate,
    });

    const compositeScore = computeDecisionScore({
      predictionScore,
      valueScore: value.valueScore,
      riskScore: risk.riskScore,
    });

    return {
      candidate,
      compositeScore,
      valueScore: value.valueScore,
      riskScore: risk.riskScore,
      predictionScore,
    };
  });
}

export function selectBestMarketCandidate(input: {
  candidates: RecommendationCandidate[];
  fusion: FeatureFusionResult | null;
  bettingIntelligence: BettingIntelligenceResult | null;
  recommendationResult?: RecommendationEngineResult | null;
}): ScoredMarketCandidate | null {
  if (input.recommendationResult?.globalPass) {
    return null;
  }

  const pool =
    input.candidates.length > 0
      ? input.candidates
      : getActionableRecommendations(input.recommendationResult ?? null);

  if (pool.length === 0) {
    return null;
  }

  const scored = scoreMarketCandidates({
    candidates: pool.filter((candidate) => candidate.confidence !== "pass"),
    fusion: input.fusion,
    bettingIntelligence: input.bettingIntelligence,
  });

  if (scored.length === 0) {
    return null;
  }

  return [...scored].sort((left, right) => {
    if (right.compositeScore !== left.compositeScore) {
      return right.compositeScore - left.compositeScore;
    }
    return right.valueScore - left.valueScore;
  })[0];
}

export function marketTypePriority(marketType: string): number {
  switch (marketType) {
    case "moneyline":
      return 4;
    case "handicap":
      return 3;
    case "totalGoals":
      return 2;
    case "btts":
      return 1;
    default:
      return 0;
  }
}

export function tieBreakCandidates(
  scored: ScoredMarketCandidate[]
): ScoredMarketCandidate | null {
  if (scored.length === 0) {
    return null;
  }
  return [...scored].sort((left, right) => {
    const scoreDiff = right.compositeScore - left.compositeScore;
    if (Math.abs(scoreDiff) > 3) {
      return scoreDiff;
    }
    const priorityDiff =
      marketTypePriority(right.candidate.marketType) -
      marketTypePriority(left.candidate.marketType);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return right.candidate.expectedValue - left.candidate.expectedValue;
  })[0];
}

export function candidateToPredictionBoost(
  candidate: RecommendationCandidate,
  fusion: FeatureFusionResult | null
): number {
  const candidateScore = normalizeScore(candidate.score);
  const fusionScore = fusion ? normalizeScore(fusion.overallScore) : 50;
  return candidateScore * 0.6 + fusionScore * 0.4;
}
