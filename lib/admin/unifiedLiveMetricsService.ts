import { getCacheMetricsSnapshot } from "@/lib/admin/adminCacheMetrics";
import { getGoogleQuotaSnapshot } from "@/lib/admin/adminGoogleQuota";
import { getGroundingRuntimeMetricsSnapshot } from "@/lib/admin/groundingRuntimeMetrics";
import { resolveProviderHealthStatuses } from "@/lib/admin/providerHealthResolver";
import type { AnalysisSnapshot } from "@/lib/database/matchSchema";
import { getApiFootballQuotaSnapshot } from "@/lib/providers/apiFootball/apiFootballQuota";
import { getGoogleSearchProvider } from "@/lib/providers/googleSearch/googleSearchProvider";
import {
  aggregateApiFootballUsageForDate,
  loadRecentExecutionLogs,
} from "@/lib/scheduler/executionLogStore";
import { getSupabaseHealthSnapshot } from "@/lib/supabase/health";
import { matchRecordRowToDomain } from "@/lib/supabase/mappers/matchRecordMapper";
import {
  countOperationallyExcludedRecords,
  countTrulyPendingVerification,
} from "@/lib/supabase/services/matchRecordPendingPolicy";
import { summarizePendingRecordClassifications } from "@/lib/supabase/services/pendingRecordClassification";
import { getProfileCacheMetricsSnapshot } from "@/lib/teamProfile/profileCacheMetrics";

export const UNIFIED_LIVE_METRICS_MAX_AGE_MS = 5 * 60 * 1000;

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export interface UnifiedMatchRecordCounts {
  total: number;
  pending: number;
  verified: number;
  anomaly: number;
  pendingOver24h: number;
}

export interface UnifiedLiveMetricsSnapshot {
  generatedAt: string;
  isStale: boolean;
  dataSource: "live";
  matchRecords: UnifiedMatchRecordCounts;
  pendingClassification: ReturnType<typeof summarizePendingRecordClassifications>["byCategory"];
  pendingOver24h: number;
  apiFootball: {
    usedToday: number;
    remainingToday: number;
    minuteUsed: number;
    minuteLimit: number;
    dailyLimit: number;
  };
  cache: ReturnType<typeof getCacheMetricsSnapshot>;
  profileCache: ReturnType<typeof getProfileCacheMetricsSnapshot>;
  grounding: ReturnType<typeof getGroundingRuntimeMetricsSnapshot>;
  providerHealth: ReturnType<typeof resolveProviderHealthStatuses>;
}

export async function buildUnifiedLiveMetricsSnapshot(
  now = new Date()
): Promise<UnifiedLiveMetricsSnapshot> {
  const runDate = todayKey(now);
  const [health, executionLogs, aggregatedApiUsage] = await Promise.all([
    getSupabaseHealthSnapshot(),
    loadRecentExecutionLogs(40),
    aggregateApiFootballUsageForDate(runDate),
  ]);

  void health;

  let matchRecords: UnifiedMatchRecordCounts = {
    total: 0,
    pending: 0,
    verified: 0,
    anomaly: 0,
    pendingOver24h: 0,
  };
  let pendingClassification = summarizePendingRecordClassifications([], now).byCategory;
  let pendingOver24h = 0;

  try {
    if (typeof window === "undefined") {
      const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
      const supabase = getSupabaseAdmin();
      const [totalResult, pendingResult, verifiedResult, anomalyResult] = await Promise.all([
        supabase.from("match_records").select("*", { count: "exact", head: true }),
        supabase
          .from("match_records")
          .select("id, match_date, fixture_id, status, analysis_snapshot, home_team, away_team, result")
          .eq("status", "PENDING"),
        supabase.from("match_records").select("*", { count: "exact", head: true }).eq("status", "VERIFIED"),
        supabase.from("match_records").select("analysis_snapshot"),
      ]);

      const pendingRows = (pendingResult.data ?? []).map((row) =>
        matchRecordRowToDomain(row)
      );
      const pendingSummary = summarizePendingRecordClassifications(pendingRows, now);

      matchRecords = {
        total: totalResult.count ?? 0,
        pending: countTrulyPendingVerification(
          pendingRows.map((record) => ({
            status: record.status,
            matchDate: record.matchDate,
            fixtureId: record.fixtureId ?? null,
            analysisSnapshot: record.analysisSnapshot,
          }))
        ),
        verified: verifiedResult.count ?? 0,
        anomaly: countOperationallyExcludedRecords(
          ((anomalyResult.data ?? []) as Array<{ analysis_snapshot: AnalysisSnapshot | null }>).map(
            (row) => ({ analysisSnapshot: row.analysis_snapshot })
          )
        ),
        pendingOver24h: pendingSummary.pendingOver24h,
      };
      pendingClassification = pendingSummary.byCategory;
      pendingOver24h = pendingSummary.pendingOver24h;
    }
  } catch {
    // Keep zero defaults.
  }

  const apiQuota = getApiFootballQuotaSnapshot();
  const usedToday = aggregatedApiUsage ?? apiQuota.dailyCount;
  const groundingConfigured = getGoogleSearchProvider().isConfigured();
  const grounding = getGroundingRuntimeMetricsSnapshot();
  grounding.groundingConfigured = groundingConfigured;

  return {
    generatedAt: now.toISOString(),
    isStale: false,
    dataSource: "live",
    matchRecords,
    pendingClassification,
    pendingOver24h,
    apiFootball: {
      usedToday,
      remainingToday: Math.max(0, apiQuota.dailyLimit - usedToday),
      minuteUsed: apiQuota.minuteCount,
      minuteLimit: apiQuota.minuteLimit,
      dailyLimit: apiQuota.dailyLimit,
    },
    cache: getCacheMetricsSnapshot(),
    profileCache: getProfileCacheMetricsSnapshot(),
    grounding,
    providerHealth: resolveProviderHealthStatuses(executionLogs, now),
  };
}

export function isUnifiedLiveMetricsStale(
  generatedAt: string | null | undefined,
  now = new Date(),
  maxAgeMs = UNIFIED_LIVE_METRICS_MAX_AGE_MS
): boolean {
  if (!generatedAt) {
    return true;
  }
  const timestamp = Date.parse(generatedAt);
  if (!Number.isFinite(timestamp)) {
    return true;
  }
  return now.getTime() - timestamp > maxAgeMs;
}
