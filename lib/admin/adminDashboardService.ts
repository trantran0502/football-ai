import type {
  AdminDashboardMetadata,
  AdminDashboardResponse,
  AdminDailySummaryPayload,
  AdminSystemSnapshotPayload,
  AdminSystemSnapshotRecord,
} from "@/lib/admin/adminDashboardTypes";
import { buildBettingIntelligenceDashboardMetrics } from "@/lib/admin/bettingDashboardMetrics";
import { buildDecisionDashboardMetrics } from "@/lib/decision/decisionDashboardMetrics";
import { buildDecisionValidationMetrics } from "@/lib/decision/decisionValidation";
import {
  computeRollingHitRate,
  computeRollingRoi,
} from "@/lib/admin/adminDailyAggregation";
import {
  countDailySummariesInSupabase,
  getSystemSnapshotRecordFromStore,
  listDailySummariesFromStore,
} from "@/lib/admin/adminDashboardStore";
import {
  ADMIN_DASHBOARD_SNAPSHOT_MAX_AGE_MS,
  buildLiveAdminSystemSnapshot,
  isSystemSnapshotFresh,
  type BuildLiveAdminSystemSnapshotDeps,
} from "@/lib/admin/adminDashboardLiveQuery";
import { loadRecentAdminErrorsFromSupabase } from "@/lib/admin/adminErrorLog";
import { loadAdminMatchRecords } from "@/lib/admin/adminRecordLoader";
import { buildLearningEngineReport } from "@/lib/learning/learningEngine";
import type { ValidationMetricBucket } from "@/lib/validation/validationTypes";

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function daysAgoKey(days: number, date = new Date()): string {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() - days);
  return copy.toISOString().slice(0, 10);
}

function filterSummariesSince(
  summaries: AdminDailySummaryPayload[],
  sinceDate: string
): AdminDailySummaryPayload[] {
  return summaries.filter((summary) => summary.summaryDate >= sinceDate);
}

function mergeStringKeyedBuckets(
  summaries: AdminDailySummaryPayload[],
  selector: (summary: AdminDailySummaryPayload) => Record<string, ValidationMetricBucket>
): Record<string, ValidationMetricBucket> {
  const groups = new Map<string, ValidationMetricBucket[]>();

  for (const summary of summaries) {
    for (const [key, bucket] of Object.entries(selector(summary))) {
      const list = groups.get(key) ?? [];
      list.push(bucket);
      groups.set(key, list);
    }
  }

  const output: Record<string, ValidationMetricBucket> = {};
  for (const [key, buckets] of groups.entries()) {
    output[key] = mergeBuckets(buckets);
  }
  return output;
}

function mergeBuckets(buckets: ValidationMetricBucket[]): ValidationMetricBucket {
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
  return merged;
}

function mergeMarketBuckets(
  summaries: AdminDailySummaryPayload[]
): AdminDailySummaryPayload["byMarket"] {
  const keys = ["Moneyline", "Handicap", "OverUnder", "BTTS"] as const;
  const output = {} as AdminDailySummaryPayload["byMarket"];
  for (const key of keys) {
    output[key] = mergeBuckets(
      summaries.map((summary) => summary.byMarket[key]).filter(Boolean)
    );
  }
  return output;
}

function emptySystemSnapshot(): AdminSystemSnapshotPayload {
  return {
    system: {
      apiFootball: {
        usedToday: 0,
        remainingToday: 100,
        minuteUsed: 0,
        minuteLimit: 10,
      },
      googleGemini: {
        searchesToday: 0,
        remainingToday: 100,
        dailyLimit: 100,
      },
      supabase: {
        configured: false,
        connected: false,
        tables: {
          match_records: 0,
          beta_recommendations: 0,
          beta_rolling_reports: 0,
          admin_daily_summaries: 0,
        },
      },
      cache: {
        hitRate: 0,
        hits: 0,
        misses: 0,
      },
      lastSyncAt: null,
    },
    analysis: {
      pendingCount: 0,
      verifiedCount: 0,
      anomalyCount: 0,
    },
  };
}

export interface ResolveAdminSystemSnapshotDeps {
  getSystemSnapshotRecord?: () => Promise<AdminSystemSnapshotRecord | null>;
  buildLiveSnapshot?: (
    now: Date,
    deps?: BuildLiveAdminSystemSnapshotDeps
  ) => Promise<AdminSystemSnapshotPayload>;
  snapshotMaxAgeMs?: number;
  liveSnapshotDeps?: BuildLiveAdminSystemSnapshotDeps;
}

export async function resolveAdminSystemSnapshot(
  now = new Date(),
  deps: ResolveAdminSystemSnapshotDeps = {}
): Promise<{
  snapshot: AdminSystemSnapshotPayload;
  metadata: AdminDashboardMetadata;
}> {
  const buildLive = deps.buildLiveSnapshot ?? buildLiveAdminSystemSnapshot;

  try {
    const liveSnapshot = await buildLive(now, deps.liveSnapshotDeps);
    return {
      snapshot: liveSnapshot,
      metadata: {
        dataSource: "live",
        snapshotTime: liveSnapshot.system.lastSyncAt,
        isStale: false,
      },
    };
  } catch {
    return {
      snapshot: emptySystemSnapshot(),
      metadata: {
        dataSource: "live",
        snapshotTime: null,
        isStale: true,
      },
    };
  }
}

export async function buildAdminDashboardResponse(
  now = new Date()
): Promise<AdminDashboardResponse> {
  const summaries = await listDailySummariesFromStore();
  const { snapshot, metadata } = await resolveAdminSystemSnapshot(now);
  const today = todayKey(now);
  const todaySummary =
    summaries.find((summary) => summary.summaryDate === today) ?? null;

  const last7 = filterSummariesSince(summaries, daysAgoKey(6, now));
  const last30 = filterSummariesSince(summaries, daysAgoKey(29, now));

  const totalRecommendations = summaries.reduce(
    (sum, summary) => sum + summary.recommendationCount,
    0
  );

  const latestAi = summaries[0]?.aiSuggestions ?? {
    increaseWeightFeatures: [],
    decreaseWeightFeatures: [],
    disableRules: [],
    suggestedNewRules: [],
  };

  const recentErrors = await loadRecentAdminErrorsFromSupabase();
  const adminRecords = await loadAdminMatchRecords();
  const bettingIntelligence = buildBettingIntelligenceDashboardMetrics(adminRecords, today);
  const decision = buildDecisionDashboardMetrics(adminRecords);
  const decisionValidation = buildDecisionValidationMetrics(
    adminRecords.filter((record) => record.status === "VERIFIED")
  );
  const learning = buildLearningEngineReport(adminRecords);

  return {
    generatedAt: now.toISOString(),
    metadata,
    system: snapshot.system,
    analysis: {
      analyzedToday: todaySummary?.analyzedCount ?? 0,
      recommendedToday: todaySummary?.recommendedCount ?? 0,
      passToday: todaySummary?.passCount ?? 0,
      pendingCount: snapshot.analysis.pendingCount,
      verifiedCount: snapshot.analysis.verifiedCount,
      anomalyCount: snapshot.analysis.anomalyCount ?? 0,
    },
    performance: {
      roiToday: todaySummary?.roi ?? 0,
      roi7d: computeRollingRoi(last7),
      roi30d: computeRollingRoi(last30),
      roiTotal: computeRollingRoi(summaries),
      hitRateTotal: computeRollingHitRate(summaries),
      totalRecommendations,
    },
    byMarket: mergeMarketBuckets(summaries),
    byLeague: mergeStringKeyedBuckets(summaries, (summary) => summary.byLeague),
    byFeature: mergeStringKeyedBuckets(summaries, (summary) => summary.byFeature),
    byRule: mergeStringKeyedBuckets(summaries, (summary) => summary.byRule),
    aiSuggestions: latestAi,
    learning,
    bettingIntelligence,
    decision: {
      ...decision,
      validation: decisionValidation,
    },
    recentErrors,
  };
}

export async function refreshSystemSnapshotTablesCount(
  base: AdminSystemSnapshotPayload
): Promise<AdminSystemSnapshotPayload> {
  const adminSummaryCount = await countDailySummariesInSupabase();
  return {
    ...base,
    system: {
      ...base.system,
      supabase: {
        ...base.system.supabase,
        tables: {
          ...base.system.supabase.tables,
          admin_daily_summaries: adminSummaryCount,
        },
      },
    },
  };
}
