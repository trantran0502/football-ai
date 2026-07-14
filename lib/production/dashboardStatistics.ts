import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type {
  ConfidenceHitRatePoint,
  ProductionDashboard,
} from "@/lib/production/productionTypes";
import {
  accumulateBucket,
  buildValidationReport,
  createEmptyBucket,
  finalizeBucket,
  summarizeSettlementCounts,
} from "@/lib/validation/statistics";
import type {
  RecommendationValidationEntry,
  ValidationMetricBucket,
} from "@/lib/validation/validationTypes";
import type { RecommendationLevel } from "@/lib/recommendation/recommendationTypes";

interface TaggedValidationEntry extends RecommendationValidationEntry {
  league: string;
}

export function collectValidationEntries(
  records: HistoricalMatchRecord[]
): TaggedValidationEntry[] {
  const entries: TaggedValidationEntry[] = [];

  for (const record of records) {
    if (record.status !== "VERIFIED") {
      continue;
    }
    const validationEntries =
      record.verificationResult?.recommendationValidation.entries ?? [];
    for (const entry of validationEntries) {
      entries.push({
        ...entry,
        league: record.league || "Unknown",
      });
    }
  }

  return entries;
}

export function buildProductionDashboard(
  records: HistoricalMatchRecord[]
): ProductionDashboard {
  const verifiedRecords = records.filter((record) => record.status === "VERIFIED");
  const entries = collectValidationEntries(records);
  const baseReport = buildValidationReport(
    entries,
    new Set(verifiedRecords.map((record) => record.id))
  );
  const settlementCounts = summarizeSettlementCounts(entries);

  return {
    totalMatches: verifiedRecords.length,
    totalRecommendations: entries.length,
    hitRate: baseReport.hitRate,
    roi: baseReport.roi,
    byMarket: baseReport.byMarket,
    byRule: baseReport.byRule,
    byLeague: buildLeagueBuckets(entries),
    byConfidence: buildConfidenceBuckets(entries),
    byFeature: baseReport.byFeature,
    confidenceVsHitRate: buildConfidenceVsHitRate(entries),
    settlementCounts,
  };
}

function buildLeagueBuckets(
  entries: TaggedValidationEntry[]
): Record<string, ValidationMetricBucket> {
  const groups = new Map<string, TaggedValidationEntry[]>();
  for (const entry of entries) {
    const bucket = groups.get(entry.league) ?? [];
    bucket.push(entry);
    groups.set(entry.league, bucket);
  }

  return Object.fromEntries(
    [...groups.entries()].map(([league, leagueEntries]) => [
      league,
      buildBucketFromEntries(leagueEntries),
    ])
  );
}

function buildConfidenceBuckets(
  entries: TaggedValidationEntry[]
): Record<RecommendationLevel, ValidationMetricBucket> {
  const levels: RecommendationLevel[] = ["pass", "low", "medium", "high"];
  const output = Object.fromEntries(
    levels.map((level) => [level, createEmptyBucket()])
  ) as Record<RecommendationLevel, ValidationMetricBucket>;

  for (const entry of entries) {
    accumulateBucket(output[entry.evaluation.confidence], entry.evaluation);
  }

  for (const level of levels) {
    finalizeBucket(output[level]);
  }

  return output;
}

function buildConfidenceVsHitRate(
  entries: TaggedValidationEntry[]
): ConfidenceHitRatePoint[] {
  const buckets = buildConfidenceBuckets(entries);
  const levels: RecommendationLevel[] = ["low", "medium", "high"];

  return levels.map((confidence) => ({
    confidence,
    sampleSize: buckets[confidence].sampleSize,
    hitRate: buckets[confidence].hitRate,
    roi: buckets[confidence].roi,
  }));
}

function buildBucketFromEntries(
  entries: TaggedValidationEntry[]
): ValidationMetricBucket {
  const bucket = createEmptyBucket();
  for (const entry of entries) {
    accumulateBucket(bucket, entry.evaluation);
  }
  finalizeBucket(bucket);
  if (entries.length > 0) {
    bucket.averageOdds =
      entries.reduce((sum, entry) => sum + entry.evaluation.odds, 0) /
      entries.length;
    bucket.averageConfidence =
      entries.reduce(
        (sum, entry) => sum + confidenceScore(entry.evaluation.confidence),
        0
      ) / entries.length;
  }
  return bucket;
}

function confidenceScore(level: RecommendationLevel): number {
  switch (level) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}
