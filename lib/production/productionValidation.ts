import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { buildProductionDashboard } from "@/lib/production/dashboardStatistics";
import { buildLearningReport } from "@/lib/production/learningReport";
import type { ProductionValidationSummary } from "@/lib/production/productionTypes";
import { buildRecommendationTraces } from "@/lib/production/recommendationTrace";
import { buildWeightReport } from "@/lib/production/weightReport";

export function buildProductionValidationSummary(
  records: HistoricalMatchRecord[]
): ProductionValidationSummary {
  const dashboard = buildProductionDashboard(records);
  const weightReport = buildWeightReport(dashboard);
  const learningReport = buildLearningReport(dashboard, weightReport);
  const traces = buildRecommendationTraces(records);

  return {
    dashboard,
    weightReport,
    learningReport,
    traces,
  };
}

export function getVerifiedProductionRecords(
  records: HistoricalMatchRecord[]
): HistoricalMatchRecord[] {
  return records.filter((record) => record.status === "VERIFIED");
}
