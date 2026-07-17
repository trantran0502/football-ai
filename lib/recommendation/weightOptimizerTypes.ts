import type { FeatureProviderKey } from "@/lib/providers/registry/types";
import type { RecommendationLearningMarketKey } from "@/lib/recommendation/recommendationLearningTypes";
import type { EvidencePerformanceReport } from "@/lib/evidence/evidenceValidation";
import type { EvidenceWeightOptimizerReport } from "@/lib/evidence/evidenceWeightOptimizerTypes";

export const DEFAULT_MARKET_GROUP_WEIGHT = 0.6;
export const DEFAULT_TEAM_GROUP_WEIGHT = 0.4;
export const MIN_MARKET_GROUP_WEIGHT = 0.4;
export const MAX_MARKET_GROUP_WEIGHT = 0.8;

export type WeightOptimizerStatus = "insufficient_sample" | "analysis";

export interface WeightGroupAnalysis {
  currentWeight: number;
  suggestedWeight: number;
  sampleSize: number;
  hitRate: number;
  roi: number;
  averageConfidence: number;
  sampleReliability: number;
  confidenceInterval: { lower: number; upper: number };
  adjustmentReason: string;
  status: WeightOptimizerStatus;
}

export interface WeightOptimizerProviderAnalysis {
  providerKey: FeatureProviderKey;
  usageCount: number;
  hitCount: number;
  hitRate: number;
  roi: number;
  averageConfidence: number;
  currentWeight: number;
  suggestedWeight: number;
  sampleReliability: number;
  adjustmentReason: string;
}

export interface WeightOptimizerMarketTypeAnalysis {
  marketKey: RecommendationLearningMarketKey;
  market: WeightGroupAnalysis;
  team: WeightGroupAnalysis;
}

export interface WeightOptimizerDiagnostics {
  recordsRead: number;
  recordsUsed: number;
  recordsSkipped: number;
  skipReasons: Record<string, number>;
  dateRange: { from: string | null; to: string | null };
  generatedAt: string;
  optimizerMode: "analysis";
  weightsApplied: false;
}

export interface WeightOptimizerReport {
  diagnostics: WeightOptimizerDiagnostics;
  overall: {
    market: WeightGroupAnalysis;
    team: WeightGroupAnalysis;
  };
  providers: WeightOptimizerProviderAnalysis[];
  byMarketType: WeightOptimizerMarketTypeAnalysis[];
  evidencePerformance: EvidencePerformanceReport;
  evidenceWeightSuggestions: EvidenceWeightOptimizerReport;
}
