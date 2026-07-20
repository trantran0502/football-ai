import { buildFallbackWeightConfig } from "@/lib/recommendation/weightConfigRuntime";
import type { RuntimeWeightConfig, WeightConfigVersion } from "@/lib/recommendation/weightConfigTypes";

export const PRODUCTION_BASELINE_WEIGHT_CONFIG_VERSION = "production-baseline-v1";

export function buildProductionBaselineWeightConfig(now = new Date()): RuntimeWeightConfig {
  const fallback = buildFallbackWeightConfig();
  const timestamp = now.toISOString();
  const activeVersion: WeightConfigVersion = {
    id: PRODUCTION_BASELINE_WEIGHT_CONFIG_VERSION,
    version: 1,
    status: "active",
    providerWeights: { ...fallback.providerWeights },
    marketBlendWeight: fallback.marketBlendWeight,
    sourceReportSnapshot: {
      kind: "production_baseline",
      note: "Non-learning baseline weights for production traceability.",
    },
    createdBy: "system",
    createdAt: timestamp,
    appliedAt: timestamp,
    archivedAt: null,
  };

  return {
    ...fallback,
    source: "fallback",
    activeVersion,
  };
}
