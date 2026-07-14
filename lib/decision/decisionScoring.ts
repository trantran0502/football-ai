import type { DecisionScoreTier } from "@/lib/decision/decisionTypes";

export function resolveDecisionScoreTier(score: number): DecisionScoreTier {
  if (score <= 20) {
    return "Avoid";
  }
  if (score <= 40) {
    return "Weak";
  }
  if (score <= 60) {
    return "Average";
  }
  if (score <= 80) {
    return "Good";
  }
  return "Excellent";
}

export function normalizeScore(value: number, min = -100, max = 100): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const clamped = Math.min(max, Math.max(min, value));
  return ((clamped - min) / (max - min)) * 100;
}

export function computePredictionScore(
  overallScore: number,
  overallConfidence: number
): number {
  const scoreComponent = normalizeScore(overallScore);
  const confidenceComponent = Math.min(100, Math.max(0, overallConfidence * 100));
  return scoreComponent * 0.7 + confidenceComponent * 0.3;
}

export function computeDecisionScore(input: {
  predictionScore: number;
  valueScore: number;
  riskScore: number;
}): number {
  const riskPenalty = input.riskScore;
  const raw =
    input.predictionScore * 0.35 +
    input.valueScore * 0.4 +
    (100 - riskPenalty) * 0.25;
  return Math.min(100, Math.max(0, raw));
}

export function decisionScoreToStars(score: number): number {
  if (score >= 81) {
    return 5;
  }
  if (score >= 61) {
    return 4;
  }
  if (score >= 41) {
    return 3;
  }
  if (score >= 21) {
    return 2;
  }
  return 1;
}

export function resolveDecisionLevel(
  decisionScore: number,
  expectedValue: number,
  riskScore: number,
  globalPass: boolean
): import("@/lib/decision/decisionTypes").DecisionLevel {
  if (globalPass || decisionScore <= 20 || expectedValue <= 0) {
    return "PASS";
  }
  if (riskScore >= 75) {
    return decisionScore >= 41 ? "WATCH" : "PASS";
  }
  if (decisionScore <= 40) {
    return "WATCH";
  }
  if (decisionScore <= 60) {
    return "SMALL BET";
  }
  if (decisionScore <= 80) {
    return "NORMAL BET";
  }
  return "STRONG BET";
}

export function computeConfidence(
  decisionScore: number,
  valueScore: number,
  riskScore: number
): number {
  const raw = decisionScore * 0.5 + valueScore * 0.35 + (100 - riskScore) * 0.15;
  return Math.min(1, Math.max(0, raw / 100));
}
