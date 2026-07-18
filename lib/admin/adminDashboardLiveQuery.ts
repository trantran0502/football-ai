import type { AdminSystemSnapshotPayload } from "@/lib/admin/adminDashboardTypes";
import { getCacheMetricsSnapshot } from "@/lib/admin/adminCacheMetrics";
import { countDailySummariesInSupabase } from "@/lib/admin/adminDashboardStore";
import { getGoogleQuotaSnapshot } from "@/lib/admin/adminGoogleQuota";
import type { AnalysisSnapshot } from "@/lib/database/matchSchema";
import { getApiFootballQuotaSnapshot } from "@/lib/providers/apiFootball/apiFootballQuota";
import {
  aggregateApiFootballUsageForDate,
  loadRecentExecutionLogs,
  loadSchedulerRuntimeState,
} from "@/lib/scheduler/executionLogStore";
import { getSupabaseHealthSnapshot } from "@/lib/supabase/health";
import { matchRecordRowToDomain } from "@/lib/supabase/mappers/matchRecordMapper";
import {
  countOperationallyExcludedRecords,
  countTrulyPendingVerification,
} from "@/lib/supabase/services/matchRecordPendingPolicy";

export const ADMIN_DASHBOARD_SNAPSHOT_MAX_AGE_MS = 60 * 60 * 1000;

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function isSystemSnapshotFresh(
  updatedAt: string | null | undefined,
  now: Date,
  maxAgeMs = ADMIN_DASHBOARD_SNAPSHOT_MAX_AGE_MS
): boolean {
  if (!updatedAt) {
    return false;
  }

  const updatedAtMs = Date.parse(updatedAt);
  if (!Number.isFinite(updatedAtMs)) {
    return false;
  }

  return now.getTime() - updatedAtMs <= maxAgeMs;
}

export interface LiveMatchStatusCounts {
  pending: number;
  verified: number;
  anomaly: number;
}

export interface BuildLiveAdminSystemSnapshotDeps {
  getHealthSnapshot?: typeof getSupabaseHealthSnapshot;
  loadMatchStatusCounts?: () => Promise<LiveMatchStatusCounts>;
  countAdminErrorLogs?: () => Promise<number>;
  loadSchedulerState?: typeof loadSchedulerRuntimeState;
  loadExecutionLogs?: typeof loadRecentExecutionLogs;
  aggregateApiUsage?: typeof aggregateApiFootballUsageForDate;
  countDailySummaries?: typeof countDailySummariesInSupabase;
}

async function loadLiveMatchStatusCounts(): Promise<LiveMatchStatusCounts> {
  try {
    if (typeof window !== "undefined") {
      return { pending: 0, verified: 0, anomaly: 0 };
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();

    const [pendingResult, verifiedResult, anomalyResult] = await Promise.all([
      supabase
        .from("match_records")
        .select("match_date, fixture_id, status, analysis_snapshot")
        .eq("status", "PENDING"),
      supabase.from("match_records").select("*", { count: "exact", head: true }).eq("status", "VERIFIED"),
      supabase.from("match_records").select("analysis_snapshot"),
    ]);

    const pendingRows = pendingResult.data ?? [];
    const pending = countTrulyPendingVerification(
      pendingRows.map((row) => {
        const record = matchRecordRowToDomain(row);
        return {
          status: record.status,
          matchDate: record.matchDate,
          fixtureId: record.fixtureId ?? null,
          analysisSnapshot: record.analysisSnapshot,
        };
      })
    );
    const anomaly = countOperationallyExcludedRecords(
      ((anomalyResult.data ?? []) as Array<{ analysis_snapshot: AnalysisSnapshot | null }>).map(
        (row) => ({
          analysisSnapshot: row.analysis_snapshot,
        })
      )
    );

    return {
      pending,
      verified: verifiedResult.count ?? 0,
      anomaly,
    };
  } catch {
    return { pending: 0, verified: 0, anomaly: 0 };
  }
}

async function countAdminErrorLogsFromSupabase(): Promise<number> {
  try {
    if (typeof window !== "undefined") {
      return 0;
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    const result = await supabase
      .from("admin_error_logs" as "match_records")
      .select("*", { count: "exact", head: true });

    return result.count ?? 0;
  } catch {
    return 0;
  }
}

export async function buildLiveAdminSystemSnapshot(
  now = new Date(),
  deps: BuildLiveAdminSystemSnapshotDeps = {}
): Promise<AdminSystemSnapshotPayload> {
  const runDate = todayKey(now);
  const getHealthSnapshot = deps.getHealthSnapshot ?? getSupabaseHealthSnapshot;
  const loadMatchStatusCounts = deps.loadMatchStatusCounts ?? loadLiveMatchStatusCounts;
  const countAdminErrorLogs = deps.countAdminErrorLogs ?? countAdminErrorLogsFromSupabase;
  const loadSchedulerState = deps.loadSchedulerState ?? loadSchedulerRuntimeState;
  const loadExecutionLogs = deps.loadExecutionLogs ?? loadRecentExecutionLogs;
  const aggregateApiUsage = deps.aggregateApiUsage ?? aggregateApiFootballUsageForDate;
  const countDailySummaries = deps.countDailySummaries ?? countDailySummariesInSupabase;

  const [
    health,
    statusCounts,
    schedulerState,
    executionLogs,
    adminErrorLogCount,
    adminSummaryCount,
    aggregatedApiUsage,
  ] = await Promise.all([
    getHealthSnapshot(),
    loadMatchStatusCounts(),
    loadSchedulerState(),
    loadExecutionLogs(20),
    countAdminErrorLogs(),
    countDailySummaries(),
    aggregateApiUsage(runDate),
  ]);

  void schedulerState;
  void executionLogs;
  void adminErrorLogCount;

  const apiQuota = getApiFootballQuotaSnapshot();
  const usedToday = aggregatedApiUsage ?? apiQuota.dailyCount;

  return {
    system: {
      apiFootball: {
        usedToday,
        remainingToday: Math.max(0, apiQuota.dailyLimit - usedToday),
        minuteUsed: apiQuota.minuteCount,
        minuteLimit: apiQuota.minuteLimit,
      },
      googleGemini: getGoogleQuotaSnapshot(),
      supabase: {
        configured: health.configured,
        connected: health.connected,
        tables: {
          match_records: health.tables.match_records,
          beta_recommendations: health.tables.beta_recommendations,
          beta_rolling_reports: health.tables.beta_rolling_reports,
          admin_daily_summaries: adminSummaryCount,
        },
      },
      cache: getCacheMetricsSnapshot(),
      lastSyncAt: now.toISOString(),
    },
    analysis: {
      pendingCount: statusCounts.pending,
      verifiedCount: statusCounts.verified,
      anomalyCount: statusCounts.anomaly,
    },
  };
}
