import type { EvidenceLearningInsights } from "@/lib/evidence/evidenceLearningIntegration";
import type { EvidenceWeightOptimizerReport } from "@/lib/evidence/evidenceWeightOptimizerTypes";
import type {
  LearningEngineRankings,
  LearningEngineSampleSize,
  RecommendationHistoryRecord,
  RulePerformanceStats,
} from "@/lib/learning/learningTypes";
import type { RecommendationValidationEntry } from "@/lib/validation/validationTypes";
import type { ValidationMarketKey, ValidationMetricBucket } from "@/lib/validation/validationTypes";
import type { FundamentalsBacktestReport } from "@/lib/fundamentalsBacktest/fundamentalsBacktestTypes";

export type AiLearningTargetType = "rule" | "market" | "league" | "evidence";

export type AiLearningAction = "increase" | "decrease" | "disable" | "monitor" | "promote" | "avoid";

export interface AiLearningSuggestion {
  target: string;
  targetType: AiLearningTargetType;
  action: AiLearningAction;
  reason: string;
  confidence: number;
  sampleSize: number;
  currentHitRate: number;
  currentRoi: number;
}

export interface AiLearningSuggestionGroups {
  ruleSuggestions: AiLearningSuggestion[];
  marketSuggestions: AiLearningSuggestion[];
  leagueSuggestions: AiLearningSuggestion[];
  evidenceSuggestions: AiLearningSuggestion[];
}

export interface ImprovementCandidate {
  target: string;
  targetType: AiLearningTargetType;
  currentPerformance: {
    hitRate: number;
    roi: number;
    sampleSize: number;
  };
  expectedImprovement: number;
  confidence: number;
  recommendation: string;
}

export interface AiLearningRuleSummary {
  rule: string;
  hitRate: number;
  roi: number;
  sampleSize: number;
}

export interface AiLearningDashboardStats {
  topImprovements: ImprovementCandidate[];
  worstRules: AiLearningRuleSummary[];
  bestRules: AiLearningRuleSummary[];
  leagueRanking: Array<{
    key: string;
    usageCount: number;
    hitRate: number;
    roi: number;
  }>;
  marketRanking: Array<{
    key: string;
    usageCount: number;
    hitRate: number;
    roi: number;
  }>;
  suggestedChanges: string[];
}

export interface AiLearningReport {
  generatedAt: string;
  optimizerMode: "analysis";
  weightsApplied: false;
  sampleSize: number;
  confidence: number;
  suggestions: AiLearningSuggestionGroups;
  improvementCandidates: ImprovementCandidate[];
  dashboard: AiLearningDashboardStats;
}

export interface AiLearningEngineInput {
  recommendationHistory: RecommendationHistoryRecord[];
  validationResults: RecommendationValidationEntry[];
  evidenceLearning: EvidenceLearningInsights;
  weightOptimizerReport: EvidenceWeightOptimizerReport;
  rules: RulePerformanceStats[];
  byLeague: Record<string, ValidationMetricBucket>;
  byMarket: Record<ValidationMarketKey, ValidationMetricBucket>;
  rankings: LearningEngineRankings;
  sampleSize: LearningEngineSampleSize;
  minSampleSize?: number;
  fundamentalsBacktest?: FundamentalsBacktestReport | null;
}

export const AI_LEARNING_MIN_SAMPLE = 5;
export const AI_LEARNING_HIGH_HIT_RATE = 0.55;
export const AI_LEARNING_LOW_HIT_RATE = 0.45;
export const AI_LEARNING_HIGH_ROI = 0.05;
export const AI_LEARNING_LOW_ROI = -0.05;
