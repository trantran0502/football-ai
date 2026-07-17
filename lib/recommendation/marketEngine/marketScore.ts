import type { MarketSignal } from "./marketEngineTypes";

/** Recommendation Engine will later blend Market Score at this weight. */
export const MARKET_ENGINE_INITIAL_WEIGHT = 0.6;

export const MARKET_ENGINE_BASE_SCORE = 65;

export const MARKET_SCORE_MIN = 0;
export const MARKET_SCORE_MAX = 100;

export interface MarketScoreInput {
  impliedEdge: number;
  balanceScore: number;
  waterQualityScore: number;
  patternPenalty: number;
}

export function clampMarketScore(score: number): number {
  if (!Number.isFinite(score)) {
    return MARKET_ENGINE_BASE_SCORE;
  }
  return Math.min(MARKET_SCORE_MAX, Math.max(MARKET_SCORE_MIN, Math.round(score)));
}

/** @deprecated Use runMarketRuleEngine score breakdown instead. */
export function computeMarketScore(input: MarketScoreInput): number {
  const raw =
    MARKET_ENGINE_BASE_SCORE +
    input.impliedEdge * 20 +
    input.balanceScore * 15 +
    input.waterQualityScore * 10 -
    input.patternPenalty * 25;

  return clampMarketScore(raw);
}

export function computeFinalMarketScore(
  baseScore: number,
  scoreAdjustments: number[]
): number {
  const total = scoreAdjustments.reduce((sum, value) => sum + value, baseScore);
  return clampMarketScore(total);
}

export function scoreToConfidence(
  marketScore: number,
  confidenceAdjustment = 0
): number {
  const adjusted = clampMarketScore(marketScore) / 100 + confidenceAdjustment;
  return Math.min(1, Math.max(0, adjusted));
}

export function deriveRiskLevel(marketScore: number): "low" | "medium" | "high" {
  if (marketScore >= 70) {
    return "low";
  }
  if (marketScore >= 45) {
    return "medium";
  }
  return "high";
}

export function findSignalValue(
  signals: MarketSignal[],
  id: string
): string | number | boolean | undefined {
  return signals.find((signal) => signal.id === id)?.value;
}
