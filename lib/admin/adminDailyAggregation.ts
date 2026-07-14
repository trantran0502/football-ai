import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { AdminDailySummaryPayload } from "@/lib/admin/adminDashboardTypes";
import { buildProductionDashboard } from "@/lib/production/dashboardStatistics";
import { buildProductionValidationSummary } from "@/lib/production/productionValidation";
import type { RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";

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

export function aggregateDailySummaryFromRecords(
  summaryDate: string,
  records: HistoricalMatchRecord[]
): AdminDailySummaryPayload {
  const dayRecords = records.filter((record) => record.matchDate === summaryDate);
  const analyzedCount = dayRecords.length;
  let recommendedCount = 0;
  let passCount = 0;

  for (const record of dayRecords) {
    const recommendation = record.analysisSnapshot?.recommendation?.result ?? null;
    if (isPassRecommendation(recommendation)) {
      passCount += 1;
    }
    if (hasActionableRecommendation(recommendation)) {
      recommendedCount += 1;
    }
  }

  const verifiedDayRecords = dayRecords.filter((record) => record.status === "VERIFIED");
  const productionSummary = buildProductionValidationSummary(verifiedDayRecords);
  const dashboard = productionSummary.dashboard;

  return {
    summaryDate,
    analyzedCount,
    recommendedCount,
    passCount,
    verifiedCount: verifiedDayRecords.length,
    recommendationCount: dashboard.totalRecommendations,
    hitRate: dashboard.hitRate,
    roi: dashboard.roi,
    byMarket: dashboard.byMarket,
    byLeague: dashboard.byLeague,
    byFeature: dashboard.byFeature,
    byRule: dashboard.byRule,
    aiSuggestions: {
      increaseWeightFeatures: productionSummary.learningReport.increaseWeightFeatures,
      decreaseWeightFeatures: productionSummary.learningReport.decreaseWeightFeatures,
      disableRules: productionSummary.learningReport.disableRules,
      suggestedNewRules: productionSummary.learningReport.suggestedNewRules,
    },
  };
}

export function mergeMetricBuckets<T extends string>(
  buckets: Array<Record<T, import("@/lib/validation/validationTypes").ValidationMetricBucket>>
): Record<T, import("@/lib/validation/validationTypes").ValidationMetricBucket> {
  if (buckets.length === 0) {
    return {} as Record<T, import("@/lib/validation/validationTypes").ValidationMetricBucket>;
  }

  const keys = Object.keys(buckets[0]) as T[];
  const output = {} as Record<T, import("@/lib/validation/validationTypes").ValidationMetricBucket>;

  for (const key of keys) {
    const merged = {
      sampleSize: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      halfWins: 0,
      halfLoses: 0,
      hitRate: 0,
      roi: 0,
      averageOdds: 0,
      averageConfidence: 0,
      totalProfit: 0,
    };
    let oddsTotal = 0;
    let confidenceTotal = 0;

    for (const bucket of buckets) {
      const value = bucket[key];
      if (!value) {
        continue;
      }
      merged.sampleSize += value.sampleSize;
      merged.wins += value.wins;
      merged.losses += value.losses;
      merged.pushes += value.pushes;
      merged.halfWins += value.halfWins;
      merged.halfLoses += value.halfLoses;
      merged.totalProfit += value.totalProfit;
      oddsTotal += value.averageOdds * value.sampleSize;
      confidenceTotal += value.averageConfidence * value.sampleSize;
    }

    const decisive = merged.sampleSize - merged.pushes;
    const hits = merged.wins + merged.halfWins;
    merged.hitRate = decisive > 0 ? hits / decisive : 0;
    merged.roi = merged.sampleSize > 0 ? merged.totalProfit / merged.sampleSize : 0;
    merged.averageOdds =
      merged.sampleSize > 0 ? oddsTotal / merged.sampleSize : 0;
    merged.averageConfidence =
      merged.sampleSize > 0 ? confidenceTotal / merged.sampleSize : 0;
    output[key] = merged;
  }

  return output;
}

export function computeRollingRoi(
  summaries: AdminDailySummaryPayload[]
): number {
  let profit = 0;
  let count = 0;
  for (const summary of summaries) {
    profit += summary.roi * summary.recommendationCount;
    count += summary.recommendationCount;
  }
  return count > 0 ? profit / count : 0;
}

export function computeRollingHitRate(
  summaries: AdminDailySummaryPayload[]
): number {
  let weighted = 0;
  let count = 0;
  for (const summary of summaries) {
    weighted += summary.hitRate * summary.recommendationCount;
    count += summary.recommendationCount;
  }
  return count > 0 ? weighted / count : 0;
}

export function mergeSummariesByMarket(
  summaries: AdminDailySummaryPayload[]
): AdminDailySummaryPayload["byMarket"] {
  return mergeMetricBuckets(summaries.map((summary) => summary.byMarket));
}

export function mergeSummariesByLeague(
  summaries: AdminDailySummaryPayload[]
): AdminDailySummaryPayload["byLeague"] {
  const groups = new Map<string, AdminDailySummaryPayload["byLeague"][string][]>();
  for (const summary of summaries) {
    for (const [league, bucket] of Object.entries(summary.byLeague)) {
      const list = groups.get(league) ?? [];
      list.push(bucket);
      groups.set(league, list);
    }
  }
  const output: AdminDailySummaryPayload["byLeague"] = {};
  for (const [league, buckets] of groups.entries()) {
    output[league] = mergeMetricBuckets([
      Object.fromEntries([[league, buckets[0]]]) as AdminDailySummaryPayload["byLeague"],
      ...buckets.slice(1).map((bucket) =>
        Object.fromEntries([[league, bucket]]) as AdminDailySummaryPayload["byLeague"]
      ),
    ])[league];
  }
  return output;
}

// Simpler merge for league/feature/rule string keys
export function mergeStringKeyedBuckets(
  summaries: AdminDailySummaryPayload[],
  selector: (summary: AdminDailySummaryPayload) => Record<string, import("@/lib/validation/validationTypes").ValidationMetricBucket>
): Record<string, import("@/lib/validation/validationTypes").ValidationMetricBucket> {
  const groups = new Map<string, import("@/lib/validation/validationTypes").ValidationMetricBucket[]>();

  for (const summary of summaries) {
    for (const [key, bucket] of Object.entries(selector(summary))) {
      const list = groups.get(key) ?? [];
      list.push(bucket);
      groups.set(key, list);
    }
  }

  const output: Record<string, import("@/lib/validation/validationTypes").ValidationMetricBucket> = {};
  for (const [key, buckets] of groups.entries()) {
    const merged = {
      sampleSize: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      halfWins: 0,
      halfLoses: 0,
      hitRate: 0,
      roi: 0,
      averageOdds: 0,
      averageConfidence: 0,
      totalProfit: 0,
    };
    let oddsTotal = 0;
    let confidenceTotal = 0;
    for (const bucket of buckets) {
      merged.sampleSize += bucket.sampleSize;
      merged.wins += bucket.wins;
      merged.losses += bucket.losses;
      merged.pushes += bucket.pushes;
      merged.halfWins += bucket.halfWins;
      merged.halfLoses += bucket.halfLoses;
      merged.totalProfit += bucket.totalProfit;
      oddsTotal += bucket.averageOdds * bucket.sampleSize;
      confidenceTotal += bucket.averageConfidence * bucket.sampleSize;
    }
    const decisive = merged.sampleSize - merged.pushes;
    merged.hitRate = decisive > 0 ? (merged.wins + merged.halfWins) / decisive : 0;
    merged.roi = merged.sampleSize > 0 ? merged.totalProfit / merged.sampleSize : 0;
    merged.averageOdds = merged.sampleSize > 0 ? oddsTotal / merged.sampleSize : 0;
    merged.averageConfidence =
      merged.sampleSize > 0 ? confidenceTotal / merged.sampleSize : 0;
    output[key] = merged;
  }
  return output;
}

export function buildEmptyDailySummary(summaryDate: string): AdminDailySummaryPayload {
  const emptyDashboard = buildProductionDashboard([]);
  return {
    summaryDate,
    analyzedCount: 0,
    recommendedCount: 0,
    passCount: 0,
    verifiedCount: 0,
    recommendationCount: 0,
    hitRate: 0,
    roi: 0,
    byMarket: emptyDashboard.byMarket,
    byLeague: {},
    byFeature: {},
    byRule: {},
    aiSuggestions: {
      increaseWeightFeatures: [],
      decreaseWeightFeatures: [],
      disableRules: [],
      suggestedNewRules: [],
    },
  };
}
