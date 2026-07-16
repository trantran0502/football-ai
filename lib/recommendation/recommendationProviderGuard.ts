import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import type { ProviderResolutionAudit } from "@/lib/providers/teamProfile/teamProfileProviderPipeline";
import { isProductionRecommendationMode } from "@/lib/providers/teamProfile/providerMode";
import type { RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";

export interface RecommendationProviderGuardResult {
  fusion: FeatureFusionResult;
  recommendation: RecommendationEngineResult | null;
  forcedPass: boolean;
  passReason: string | null;
  guardWarnings: string[];
}

export function applyRecommendationProviderGuard(input: {
  fusion: FeatureFusionResult;
  recommendation: RecommendationEngineResult | null;
  audit: ProviderResolutionAudit;
}): RecommendationProviderGuardResult {
  const guardWarnings: string[] = [];
  const warnings = [...input.fusion.warnings];

  if (input.audit.mockProviderCount > 0 && isProductionRecommendationMode()) {
    guardWarnings.push(
      `Production recommendation blocked mock providers (${input.audit.mockProviderCount}).`
    );
  }

  if (input.audit.criticalProvidersUnavailable) {
    guardWarnings.push(
      "Critical team-profile providers unavailable for recommendation."
    );
  }

  if (input.audit.unavailableProviderCount > 0) {
    guardWarnings.push(
      `Unavailable providers: ${input.audit.unavailableProviderCount}.`
    );
  }

  const shouldForcePass =
    isProductionRecommendationMode() &&
    (input.audit.criticalProvidersUnavailable || input.audit.mockProviderCount > 0);

  if (shouldForcePass) {
    warnings.push({
      code: "insufficient_data",
      message: "Recommendation blocked due to unavailable or mock provider data.",
      details: {
        mockProviderCount: input.audit.mockProviderCount,
        unavailableProviderCount: input.audit.unavailableProviderCount,
        teamProfileProviderCount: input.audit.teamProfileProviderCount,
        criticalProvidersUnavailable: input.audit.criticalProvidersUnavailable,
      },
    });

    return {
      fusion: {
        ...input.fusion,
        overallConfidence: Math.min(input.fusion.overallConfidence, 0.2),
        warnings,
      },
      recommendation: input.recommendation
        ? {
            ...input.recommendation,
            globalPass: false,
            passReason:
              input.audit.criticalProvidersUnavailable
                ? "Critical team-profile providers unavailable."
                : "Mock provider data is not allowed in production recommendation.",
            candidates: input.recommendation.candidates.map((candidate) => ({
              ...candidate,
              confidence: "low",
            })),
          }
        : null,
      forcedPass: true,
      passReason:
        input.audit.criticalProvidersUnavailable
          ? "Critical team-profile providers unavailable."
          : "Mock provider data is not allowed in production recommendation.",
      guardWarnings,
    };
  }

  if (input.audit.mockProviderCount > 0) {
    warnings.push({
      code: "low_confidence",
      message: `Mock providers used in recommendation context (${input.audit.mockProviderCount}).`,
      details: {
        mockProviderCount: input.audit.mockProviderCount,
        unavailableProviderCount: input.audit.unavailableProviderCount,
      },
    });
  }

  return {
    fusion: {
      ...input.fusion,
      warnings,
      overallConfidence:
        input.audit.mockProviderCount > 0
          ? Math.min(input.fusion.overallConfidence, 0.35)
          : input.fusion.overallConfidence,
    },
    recommendation: input.recommendation,
    forcedPass: false,
    passReason: null,
    guardWarnings,
  };
}
