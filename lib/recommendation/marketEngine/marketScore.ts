import type { MarketSignal } from "./marketEngineTypes";

/** Recommendation Engine will later blend Market Score at this weight. */
export const MARKET_ENGINE_INITIAL_WEIGHT = 0.6;

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
    return 50;
  }
  return Math.min(MARKET_SCORE_MAX, Math.max(MARKET_SCORE_MIN, Math.round(score)));
}

export function computeMarketScore(input: MarketScoreInput): number {
  const raw =
    50 +
    input.impliedEdge * 20 +
    input.balanceScore * 15 +
    input.waterQualityScore * 10 -
    input.patternPenalty * 25;

  return clampMarketScore(raw);
}

export function scoreToConfidence(marketScore: number): number {
  return clampMarketScore(marketScore) / 100;
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
