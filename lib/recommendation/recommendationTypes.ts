import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import type { MarketSelection, MarketType } from "@/types/match";
import type { ProviderRecommendationDiagnostic } from "@/lib/recommendation/providerWeightEngine";

export type RecommendationLevel = "pass" | "low" | "medium" | "high";

export interface RecommendationCandidate {
  marketType: MarketType;
  selection: MarketSelection;
  confidence: RecommendationLevel;
  expectedValue: number;
  score: number;
  reasons: string[];
  warnings: string[];
  supportingFeatures: string[];
}

export interface RecommendationEngineInput {
  fusion: FeatureFusionResult;
  marketSelections: MarketSelection[];
}

export interface RecommendationEngineResult {
  candidates: RecommendationCandidate[];
  globalPass: boolean;
  passReason: string | null;
  usableProviderCount: number;
  unavailableProviderCount: number;
  providerDiagnostics: ProviderRecommendationDiagnostic[];
  providerOverallConfidence: number | null;
}

export interface RecommendationEngineOptions {
  minOverallConfidence?: number;
  maxWarningsBeforePass?: number;
  maxConflictsBeforePass?: number;
  minTotalFeatures?: number;
}

export type { FeatureFusionResult, MarketSelection, ProviderRecommendationDiagnostic };

export function createEmptyRecommendationResult(
  overrides: Partial<RecommendationEngineResult> = {}
): RecommendationEngineResult {
  return {
    candidates: [],
    globalPass: true,
    passReason: null,
    usableProviderCount: 0,
    unavailableProviderCount: 0,
    providerDiagnostics: [],
    providerOverallConfidence: null,
    ...overrides,
  };
}
