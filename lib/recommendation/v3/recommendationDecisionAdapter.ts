import type { DecisionOutcome } from "@/lib/decision/v3/decisionTypes";
import type {
  ComparableDirection,
  ComparableRecommendation,
} from "@/lib/recommendation/v3/recommendationComparisonTypes";
import type {
  RecommendationCandidate,
  RecommendationEngineResult,
  RecommendationLevel,
} from "@/lib/recommendation/recommendationTypes";
import type { MarketSide } from "@/types/match";

const CONFIDENCE_RANK: Record<string, number> = {
  pass: 0,
  low: 1,
  medium: 2,
  high: 3,
  lean: 2,
  bet: 3,
  strong_bet: 3,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mapSideToDirection(
  side: MarketSide | null | undefined,
  globalPass: boolean
): ComparableDirection {
  if (globalPass || !side) {
    return "pass";
  }

  if (
    side === "home" ||
    side === "away" ||
    side === "draw" ||
    side === "over" ||
    side === "under"
  ) {
    return side;
  }

  return "neutral";
}

function normalizeLegacyScore(score: number): number {
  return round(clamp(score / 100, -1, 1));
}

export function pickLegacyTopCandidate(
  result: RecommendationEngineResult | null
): RecommendationCandidate | null {
  if (!result || result.globalPass) {
    return null;
  }

  const actionable = result.candidates.filter(
    (candidate) => candidate.confidence !== "pass"
  );
  if (actionable.length === 0) {
    return null;
  }

  return [...actionable].sort((left, right) => right.score - left.score)[0] ?? null;
}

export function adaptLegacyRecommendation(
  result: RecommendationEngineResult | null
): ComparableRecommendation {
  const topCandidate = pickLegacyTopCandidate(result);
  const globalPass = result?.globalPass ?? true;
  const confidence = topCandidate?.confidence ?? "pass";

  return {
    marketType: topCandidate?.marketType ?? null,
    side: topCandidate?.selection.side ?? null,
    direction: mapSideToDirection(topCandidate?.selection.side, globalPass),
    confidenceLevel: confidence,
    weightedScore: topCandidate ? normalizeLegacyScore(topCandidate.score) : 0,
    topReasons: (topCandidate?.reasons ?? []).slice(0, 5),
    topObjections: (topCandidate?.warnings ?? []).slice(0, 5),
    globalPass,
  };
}

export function adaptDecisionRecommendation(
  outcome: DecisionOutcome
): ComparableRecommendation {
  const globalPass = outcome.decision === "pass";

  return {
    marketType: outcome.candidate?.marketType ?? null,
    side: outcome.candidate?.side ?? null,
    direction: mapSideToDirection(outcome.candidate?.side, globalPass),
    confidenceLevel: outcome.confidence,
    weightedScore: round(outcome.weightedScore),
    topReasons: outcome.reasons.map((reason) => reason.summary).slice(0, 5),
    topObjections: outcome.objections.map((objection) => objection.summary).slice(0, 5),
    globalPass,
  };
}

export function rankComparableConfidence(level: string): number {
  return CONFIDENCE_RANK[level] ?? 0;
}

export function rankLegacyConfidence(level: RecommendationLevel | string): number {
  return CONFIDENCE_RANK[level] ?? 0;
}
