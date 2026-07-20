import type { AdminSystemSnapshotPayload } from "@/lib/admin/adminDashboardTypes";
import { getCacheMetricsSnapshot } from "@/lib/admin/adminCacheMetrics";
import { countDailySummariesInSupabase } from "@/lib/admin/adminDashboardStore";
import { getGoogleQuotaSnapshot } from "@/lib/admin/adminGoogleQuota";
import { buildUnifiedLiveMetricsSnapshot } from "@/lib/admin/unifiedLiveMetricsService";
import { getSupabaseHealthSnapshot } from "@/lib/supabase/health";

export const ADMIN_DASHBOARD_SNAPSHOT_MAX_AGE_MS = 5 * 60 * 1000;

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
  countDailySummaries?: typeof countDailySummariesInSupabase;
}

export async function buildLiveAdminSystemSnapshot(
  now = new Date(),
  deps: BuildLiveAdminSystemSnapshotDeps = {}
): Promise<AdminSystemSnapshotPayload> {
  void todayKey(now);
  const getHealthSnapshot = deps.getHealthSnapshot ?? getSupabaseHealthSnapshot;
  const countDailySummaries = deps.countDailySummaries ?? countDailySummariesInSupabase;
  const [health, adminSummaryCount, unified] = await Promise.all([
    getHealthSnapshot(),
    countDailySummaries(),
    buildUnifiedLiveMetricsSnapshot(now),
  ]);

  return {
    system: {
      apiFootball: unified.apiFootball,
      googleGemini: getGoogleQuotaSnapshot(),
      supabase: {
        configured: health.configured,
        connected: health.connected,
        tables: {
          match_records: unified.matchRecords.total,
          beta_recommendations: health.tables.beta_recommendations,
          beta_rolling_reports: health.tables.beta_rolling_reports,
          admin_daily_summaries: adminSummaryCount,
        },
      },
      cache: getCacheMetricsSnapshot(),
      lastSyncAt: unified.generatedAt,
    },
    analysis: {
      pendingCount: unified.matchRecords.pending,
      verifiedCount: unified.matchRecords.verified,
      anomalyCount: unified.matchRecords.anomaly,
    },
  };
}
