import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";
import type { SchedulerDailySummary } from "@/lib/scheduler/schedulerTypes";
import { buildProductionDashboard } from "@/lib/production/dashboardStatistics";
import type { ValidationMarketKey } from "@/lib/validation/validationTypes";

function isPassRecommendation(result: RecommendationEngineResult | null | undefined): boolean {
  if (!result) {
    return true;
  }
  if (result.globalPass) {
    return true;
  }
  return result.candidates.every((candidate) => candidate.confidence === "pass");
}

function hasActionableRecommendation(
  result: RecommendationEngineResult | null | undefined
): boolean {
  if (!result || result.globalPass) {
    return false;
  }
  return result.candidates.some((candidate) => candidate.confidence !== "pass");
}

function countRecommendationsByMarket(
  records: HistoricalMatchRecord[]
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const record of records) {
    const recommendation = record.analysisSnapshot?.recommendation?.result ?? null;
    if (!hasActionableRecommendation(recommendation)) {
      continue;
    }
    for (const candidate of recommendation!.candidates) {
      if (candidate.confidence === "pass") {
        continue;
      }
      const key = candidate.marketType;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }

  return counts;
}

function countRecommendationsByLeague(
  records: HistoricalMatchRecord[]
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const record of records) {
    const recommendation = record.analysisSnapshot?.recommendation?.result ?? null;
    if (!hasActionableRecommendation(recommendation)) {
      continue;
    }
    const league = record.league || "Unknown";
    counts[league] = (counts[league] ?? 0) + 1;
  }

  return counts;
}

export function buildSchedulerDailySummary(
  summaryDate: string,
  records: HistoricalMatchRecord[]
): SchedulerDailySummary {
  const dayRecords = records.filter((record) => record.matchDate === summaryDate);
  const analyzedCount = dayRecords.length;
  let passCount = 0;
  let recommendedCount = 0;

  for (const record of dayRecords) {
    const recommendation = record.analysisSnapshot?.recommendation?.result ?? null;
    if (isPassRecommendation(recommendation)) {
      passCount += 1;
    }
    if (hasActionableRecommendation(recommendation)) {
      recommendedCount += 1;
    }
  }

  const pendingCount = dayRecords.filter((record) => record.status === "PENDING").length;
  const verifiedCount = dayRecords.filter((record) => record.status === "VERIFIED").length;
  const verifiedDayRecords = dayRecords.filter((record) => record.status === "VERIFIED");
  const todayDashboard = buildProductionDashboard(verifiedDayRecords);
  const cumulativeDashboard = buildProductionDashboard(
    records.filter((record) => record.status === "VERIFIED")
  );

  const recommendationsByMarket = countRecommendationsByMarket(dayRecords);
  const recommendationsByLeague = countRecommendationsByLeague(dayRecords);

  const byMarketFromValidation: Record<string, number> = {};
  for (const [market, bucket] of Object.entries(todayDashboard.byMarket) as Array<
    [ValidationMarketKey, { sampleSize: number }]
  >) {
    if (bucket.sampleSize > 0) {
      byMarketFromValidation[market] = bucket.sampleSize;
    }
  }

  return {
    summaryDate,
    analyzedCount,
    passCount,
    recommendedCount,
    recommendationsByMarket: {
      ...byMarketFromValidation,
      ...recommendationsByMarket,
    },
    recommendationsByLeague,
    pendingCount,
    verifiedCount,
    todayRoi: todayDashboard.roi,
    cumulativeRoi: cumulativeDashboard.roi,
  };
}

export function buildEmptySchedulerDailySummary(summaryDate: string): SchedulerDailySummary {
  return {
    summaryDate,
    analyzedCount: 0,
    passCount: 0,
    recommendedCount: 0,
    recommendationsByMarket: {},
    recommendationsByLeague: {},
    pendingCount: 0,
    verifiedCount: 0,
    todayRoi: 0,
    cumulativeRoi: 0,
  };
}
