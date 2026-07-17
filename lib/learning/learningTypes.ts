import type { DecisionLevel } from "@/lib/decision/decisionTypes";
import type {
  EvidencePerformanceReport,
  EvidencePerformanceStats,
} from "@/lib/evidence/evidenceValidation";
import type { EvidenceWeightOptimizerReport } from "@/lib/evidence/evidenceWeightOptimizerTypes";
import type { EvidenceLearningInsights, EvidenceRankedEntry } from "@/lib/evidence/evidenceLearningIntegration";
import type { ValidationMarketKey, ValidationMetricBucket } from "@/lib/validation/validationTypes";

export interface FeaturePerformanceStats {
  feature: string;
  usageCount: number;
  hitRate: number;
  roi: number;
  averageConfidence: number;
  averageContributionScore: number;
}

export interface RulePerformanceStats {
  rule: string;
  usageCount: number;
  hitRate: number;
  roi: number;
}

export interface DecisionLevelStats {
  level: DecisionLevel;
  usageCount: number;
  hitRate: number;
  roi: number;
  averageDecisionScore: number;
}

export interface ModelVersionStats {
  version: string;
  usageCount: number;
  hitRate: number;
  roi: number;
  verifiedMatches: number;
}

export interface RankedMetricBucket {
  key: string;
  usageCount: number;
  hitRate: number;
  roi: number;
}

export interface LearningSuggestions {
  increaseWeightFeatures: string[];
  decreaseWeightFeatures: string[];
  disableRules: string[];
  suggestedNewRules: string[];
}

export interface LearningEngineSampleSize {
  validationEntries: number;
  verifiedMatches: number;
  recommendationHistory: number;
  featureHistory: number;
  decisionHistory: number;
}

export interface LearningEngineRankings {
  topFeatures: FeaturePerformanceStats[];
  worstFeatures: FeaturePerformanceStats[];
  topRules: RulePerformanceStats[];
  worstRules: RulePerformanceStats[];
  leagueRoiRanking: RankedMetricBucket[];
  marketRoiRanking: RankedMetricBucket[];
  evidenceByAccuracy: EvidencePerformanceStats[];
  evidenceByConfidence: EvidencePerformanceStats[];
  evidenceByUsage: EvidencePerformanceStats[];
  evidenceOverallRanking: EvidenceRankedEntry[];
}

export interface LearningEngineReport {
  generatedAt: string;
  sampleSize: LearningEngineSampleSize;
  features: FeaturePerformanceStats[];
  rules: RulePerformanceStats[];
  byLeague: Record<string, ValidationMetricBucket>;
  byMarket: Record<ValidationMarketKey, ValidationMetricBucket>;
  byDecisionLevel: Record<DecisionLevel, DecisionLevelStats>;
  byModelVersion: Record<string, ModelVersionStats>;
  suggestions: LearningSuggestions;
  rankings: LearningEngineRankings;
  evidencePerformance: EvidencePerformanceReport;
  evidenceWeightSuggestions: EvidenceWeightOptimizerReport;
  evidenceLearning: EvidenceLearningInsights;
  aiLearning: import("@/lib/learning/aiLearningTypes").AiLearningReport;
}

export interface LearningEngineInput {
  validationResults: import("@/lib/validation/validationTypes").RecommendationValidationEntry[];
  recommendationHistory: RecommendationHistoryRecord[];
  featureHistory: FeatureHistoryRecord[];
  decisionHistory: DecisionHistoryRecord[];
}

export interface RecommendationHistoryRecord {
  matchId: string;
  matchDate: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  modelVersion: string;
  recommendation: import("@/lib/recommendation/recommendationTypes").RecommendationEngineResult | null;
  validationEntries: import("@/lib/validation/validationTypes").RecommendationValidationEntry[];
}

export interface FeatureHistoryRecord {
  matchId: string;
  modelVersion: string;
  features: import("@/lib/analysis/types").AnalysisFeature[];
  fusion: import("@/lib/analysis/featureScore/fusion/fusionTypes").FeatureFusionResult | null;
  supportingFeatures: string[];
}

export interface DecisionHistoryRecord {
  matchId: string;
  modelVersion: string;
  decision: import("@/lib/decision/decisionTypes").DecisionResult | null;
  validationEntry: import("@/lib/decision/decisionTypes").DecisionValidationEntry | null;
}

export interface LearningEngineConfig {
  minSampleSize: number;
  highRoiThreshold: number;
  lowRoiThreshold: number;
  invalidHitRateThreshold: number;
  rankingLimit: number;
}

export const DEFAULT_LEARNING_ENGINE_CONFIG: LearningEngineConfig = {
  minSampleSize: 5,
  highRoiThreshold: 0.05,
  lowRoiThreshold: -0.05,
  invalidHitRateThreshold: 0.4,
  rankingLimit: 10,
};
