export type {
  DecisionHistoryRecord,
  DecisionLevelStats,
  FeatureHistoryRecord,
  FeaturePerformanceStats,
  LearningEngineConfig,
  LearningEngineInput,
  LearningEngineRankings,
  LearningEngineReport,
  LearningEngineSampleSize,
  LearningSuggestions,
  ModelVersionStats,
  RankedMetricBucket,
  RecommendationHistoryRecord,
  RulePerformanceStats,
} from "@/lib/learning/learningTypes";

export type {
  EvidencePerformanceReport,
  EvidencePerformanceStats,
} from "@/lib/evidence/evidenceValidation";
export type {
  EvidenceWeightOptimizerReport,
  EvidenceWeightSuggestion,
} from "@/lib/evidence/evidenceWeightOptimizerTypes";
export type {
  EvidenceHealthStatus,
  EvidenceHealthSummary,
  EvidenceLearningInsights,
  EvidenceRankedEntry,
} from "@/lib/evidence/evidenceLearningIntegration";

export { DEFAULT_LEARNING_ENGINE_CONFIG } from "@/lib/learning/learningTypes";
export { buildLearningEngineReport } from "@/lib/learning/learningEngine";
export {
  buildAiLearningReport,
  buildImprovementCandidates,
  computeAiLearningConfidence,
} from "@/lib/learning/aiLearningEngine";
export type {
  AiLearningAction,
  AiLearningDashboardStats,
  AiLearningEngineInput,
  AiLearningReport,
  AiLearningRuleSummary,
  AiLearningSuggestion,
  AiLearningSuggestionGroups,
  AiLearningTargetType,
  ImprovementCandidate,
} from "@/lib/learning/aiLearningTypes";
export {
  collectLearningInputFromRecords,
  resolveFeatureContributionScore,
  resolveModelVersion,
} from "@/lib/learning/performanceAnalyzer";
export type { TaggedValidationEntry } from "@/lib/learning/performanceAnalyzer";
export { buildWeightSuggestions } from "@/lib/learning/weightSuggestions";
export type { WeightSuggestionInput } from "@/lib/learning/weightSuggestions";
