import { clampConfidence } from "@/lib/analysis/featureScore/oddsConversion";
import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import type { ValueBetMetrics, ValueRating } from "@/lib/betting/intelligenceTypes";

const EV_PERCENT_SCALE = 100;

export function calculateFairOdds(trueProbability: number): number | null {
  if (!Number.isFinite(trueProbability) || trueProbability <= 0) {
    return null;
  }
  return 1 / trueProbability;
}

export function calculateExpectedValue(
  trueProbability: number,
  decimalOdds: number
): number {
  if (
    !Number.isFinite(trueProbability) ||
    !Number.isFinite(decimalOdds) ||
    decimalOdds <= 0
  ) {
    return 0;
  }
  return trueProbability * decimalOdds - 1;
}

export function calculateEdge(trueProbability: number, impliedProbability: number): number {
  if (!Number.isFinite(trueProbability) || !Number.isFinite(impliedProbability)) {
    return 0;
  }
  return trueProbability - impliedProbability;
}

export function resolveValueRating(expectedValue: number): ValueRating {
  if (expectedValue <= 0) {
    return "none";
  }
  if (expectedValue < 0.02) {
    return "low";
  }
  if (expectedValue < 0.05) {
    return "medium";
  }
  if (expectedValue < 0.1) {
    return "high";
  }
  return "strong";
}

export function calculateKellyFraction(
  trueProbability: number,
  decimalOdds: number
): number {
  if (
    !Number.isFinite(trueProbability) ||
    !Number.isFinite(decimalOdds) ||
    decimalOdds <= 1
  ) {
    return 0;
  }
  const b = decimalOdds - 1;
  const p = trueProbability;
  const q = 1 - p;
  const fraction = (b * p - q) / b;
  return clampConfidence(Math.max(0, fraction));
}

export function estimateTrueProbability(input: {
  fairProbability: number | null;
  impliedProbability: number;
  fusion: FeatureFusionResult | null;
}): number {
  const base = input.fairProbability ?? input.impliedProbability;
  const fusionBoost =
    input.fusion !== null ? (input.fusion.overallScore / 100) * 0.12 : 0;
  return clampConfidence(base + fusionBoost);
}

export function buildValueBetMetrics(input: {
  decimalOdds: number;
  impliedProbability: number;
  fairProbability: number | null;
  fusion: FeatureFusionResult | null;
  closingLineValue?: number | null;
}): ValueBetMetrics {
  const trueProbability = estimateTrueProbability({
    fairProbability: input.fairProbability,
    impliedProbability: input.impliedProbability,
    fusion: input.fusion,
  });
  const expectedValue = calculateExpectedValue(trueProbability, input.decimalOdds);
  const fairOdds = calculateFairOdds(trueProbability) ?? input.decimalOdds;
  const edge = calculateEdge(trueProbability, input.impliedProbability);

  return {
    expectedValue,
    expectedValuePercent: expectedValue * EV_PERCENT_SCALE,
    fairOdds,
    edge,
    valueRating: resolveValueRating(expectedValue),
    confidence: clampConfidence(
      input.fusion?.overallConfidence ?? input.impliedProbability
    ),
    kellyFraction: calculateKellyFraction(trueProbability, input.decimalOdds),
    closingLineValue: input.closingLineValue ?? null,
  };
}
