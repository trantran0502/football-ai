export type {
  ConfidenceHitRatePoint,
  DailyPipelineItemResult,
  DailyPipelineResult,
  LearningReport,
  ProductionDashboard,
  ProductionFixture,
  ProductionResultUpdate,
  ProductionValidationSummary,
  RecommendationTrace,
  ResultPipelineItemResult,
  ResultPipelineResult,
  WeightReport,
} from "@/lib/production/productionTypes";

export {
  buildRecommendationTrace,
  buildRecommendationTraces,
} from "@/lib/production/recommendationTrace";

export {
  filterFixturesForDate,
  runDailyMatchPipeline,
} from "@/lib/production/dailyMatchPipeline";
export type { DailyMatchPipelineDependencies } from "@/lib/production/dailyMatchPipeline";

export {
  buildResultUpdatesFromFixtures,
  listPendingProductionMatches,
  runResultUpdatePipeline,
} from "@/lib/production/resultUpdatePipeline";
export type { ResultUpdatePipelineDependencies } from "@/lib/production/resultUpdatePipeline";

export {
  buildProductionDashboard,
  collectValidationEntries,
} from "@/lib/production/dashboardStatistics";

export { buildWeightReport } from "@/lib/production/weightReport";
export { buildLearningReport } from "@/lib/production/learningReport";

export {
  buildProductionValidationSummary,
  getVerifiedProductionRecords,
} from "@/lib/production/productionValidation";

export {
  listInMemoryProductionRecords,
  listPendingInMemory,
  resetInMemoryProductionStore,
  saveMatchIfNewInMemory,
  saveMatchInMemory,
  verifyMatchInMemory,
} from "@/lib/production/inMemoryProductionStore";

export {
  buildProductionSummaryFromSupabase,
  listPendingFromSupabase,
  runProductionDailyJob,
  runProductionResultJob,
} from "@/lib/production/supabaseProductionStore";
