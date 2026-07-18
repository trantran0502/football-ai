import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import type { FeatureProviderKey, ProviderDataSource } from "@/lib/providers/registry/types";
import { FEATURE_PROVIDER_KEYS } from "@/lib/providers/registry/types";
import type { ProviderResolutionAudit } from "@/lib/providers/teamProfile/teamProfileProviderPipeline";
import { clampConfidence, clampScore } from "@/lib/analysis/featureScore/oddsConversion";
import {
  PROVIDER_TO_FUSION_CATEGORY,
} from "@/lib/recommendation/providerWeights";
import { buildFallbackWeightConfig } from "@/lib/recommendation/weightConfigRuntime";
import { getCategoryWeightedScore } from "@/lib/recommendation/recommendationRules";

export interface ProviderRecommendationDiagnostic {
  providerKey: FeatureProviderKey;
  providerWeight: number;
  providerContribution: number;
  providerSource: ProviderDataSource;
  providerConfidence: number;
}

export interface ProviderWeightingResult {
  overallScore: number;
  overallConfidence: number;
  diagnostics: ProviderRecommendationDiagnostic[];
  normalizedWeights: Partial<Record<FeatureProviderKey, number>>;
  usableProviderCount: number;
  unavailableProviderCount: number;
}

function isProviderUsable(source: ProviderDataSource | undefined): boolean {
  return source !== undefined && source !== "unavailable";
}

export function computeProviderWeighting(
  fusion: FeatureFusionResult,
  audit: ProviderResolutionAudit,
  providerWeights: Record<FeatureProviderKey, number> = buildFallbackWeightConfig().providerWeights
): ProviderWeightingResult {
  const usableProviders = FEATURE_PROVIDER_KEYS.filter((providerKey) =>
    isProviderUsable(audit.providerSources[providerKey])
  );
  const unavailableProviderCount = FEATURE_PROVIDER_KEYS.length - usableProviders.length;

  const baseWeightTotal = usableProviders.reduce(
    (sum, providerKey) => sum + providerWeights[providerKey],
    0
  );

  const diagnostics: ProviderRecommendationDiagnostic[] = [];
  const normalizedWeights: Partial<Record<FeatureProviderKey, number>> = {};

  let overallScore = 0;
  let overallConfidence = 0;

  if (baseWeightTotal <= 0) {
    return {
      overallScore: 0,
      overallConfidence: 0,
      diagnostics: FEATURE_PROVIDER_KEYS.map((providerKey) => ({
        providerKey,
        providerWeight: 0,
        providerContribution: 0,
        providerSource: audit.providerSources[providerKey] ?? "unavailable",
        providerConfidence:
          audit.resolved.find((entry) => entry.key === providerKey)?.confidence ?? 0,
      })),
      normalizedWeights,
      usableProviderCount: 0,
      unavailableProviderCount,
    };
  }

  for (const providerKey of FEATURE_PROVIDER_KEYS) {
    const source = audit.providerSources[providerKey] ?? "unavailable";
    const snapshot = audit.resolved.find((entry) => entry.key === providerKey);
    const providerConfidence = snapshot?.confidence ?? 0;

    if (!isProviderUsable(source)) {
      diagnostics.push({
        providerKey,
        providerWeight: 0,
        providerContribution: 0,
        providerSource: source,
        providerConfidence,
      });
      continue;
    }

    const providerWeight = providerWeights[providerKey] / baseWeightTotal;
    normalizedWeights[providerKey] = providerWeight;

    const category = PROVIDER_TO_FUSION_CATEGORY[providerKey];
    const categoryScore = getCategoryWeightedScore(fusion, category);
    const providerContribution = categoryScore * providerWeight;

    overallScore += providerContribution;
    overallConfidence += providerConfidence * providerWeight;

    diagnostics.push({
      providerKey,
      providerWeight: Math.round(providerWeight * 10000) / 10000,
      providerContribution: Math.round(providerContribution * 1000) / 1000,
      providerSource: source,
      providerConfidence: Math.round(providerConfidence * 1000) / 1000,
    });
  }

  return {
    overallScore: clampScore(overallScore),
    overallConfidence: clampConfidence(overallConfidence),
    diagnostics,
    normalizedWeights,
    usableProviderCount: usableProviders.length,
    unavailableProviderCount,
  };
}

export function applyProviderWeightingToFusion(
  fusion: FeatureFusionResult,
  weighting: ProviderWeightingResult
): FeatureFusionResult {
  return {
    ...fusion,
    overallScore: weighting.overallScore,
    overallConfidence: weighting.overallConfidence,
  };
}
