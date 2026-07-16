import type { FusionSourceCategory } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import type { FeatureProviderKey } from "@/lib/providers/registry/types";

export const DEFAULT_PROVIDER_WEIGHTS: Record<FeatureProviderKey, number> = {
  recentForm: 0.24,
  homeAway: 0.18,
  goalsXg: 0.18,
  scoringPattern: 0.12,
  leagueStrength: 0.08,
  h2h: 0.08,
  squadAvailability: 0.06,
  matchContext: 0.06,
};

export const PROVIDER_TO_FUSION_CATEGORY: Record<
  FeatureProviderKey,
  FusionSourceCategory
> = {
  recentForm: "recentForm",
  homeAway: "homeAway",
  goalsXg: "goalsXg",
  scoringPattern: "scoringPattern",
  leagueStrength: "leagueStrength",
  h2h: "h2h",
  squadAvailability: "squadAvailability",
  matchContext: "matchContext",
};

export function sumProviderWeights(
  weights: Record<FeatureProviderKey, number> = DEFAULT_PROVIDER_WEIGHTS
): number {
  return Object.values(weights).reduce((sum, weight) => sum + weight, 0);
}

export function assertDefaultProviderWeightsSumToOne(): void {
  const total = sumProviderWeights();
  if (Math.abs(total - 1) > 1e-6) {
    throw new Error(`Provider weights must sum to 1.00, got ${total}`);
  }
}

assertDefaultProviderWeightsSumToOne();
