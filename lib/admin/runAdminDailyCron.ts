import { getCacheMetricsSnapshot } from "@/lib/admin/adminCacheMetrics";
import {
  aggregateDailySummaryFromRecords,
  buildEmptyDailySummary,
} from "@/lib/admin/adminDailyAggregation";
import {
  refreshSystemSnapshotTablesCount,
} from "@/lib/admin/adminDashboardService";
import type { AdminSystemSnapshotPayload } from "@/lib/admin/adminDashboardTypes";
import {
  upsertDailySummary,
  upsertSystemSnapshot,
} from "@/lib/admin/adminDashboardStore";
import { getGoogleQuotaSnapshot } from "@/lib/admin/adminGoogleQuota";
import { getApiFootballQuotaSnapshot } from "@/lib/providers/apiFootball/apiFootballQuota";
import { getSupabaseHealthSnapshot } from "@/lib/supabase/health";
import { matchRecordRowToDomain } from "@/lib/supabase/mappers/matchRecordMapper";

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export async function runAdminDailyCron(
  summaryDate: string = todayKey()
): Promise<{
  summaryDate: string;
  syncedAt: string;
}> {
  const records = await loadMatchRecordsForSummaryDate(summaryDate);
  const payload =
    records.length > 0
      ? aggregateDailySummaryFromRecords(summaryDate, records)
      : buildEmptyDailySummary(summaryDate);

  await upsertDailySummary(payload);

  const health = await getSupabaseHealthSnapshot();
  const apiQuota = getApiFootballQuotaSnapshot();
  const googleQuota = getGoogleQuotaSnapshot();
  const cache = getCacheMetricsSnapshot();
  const statusCounts = await loadMatchStatusCounts();

  const systemSnapshot: AdminSystemSnapshotPayload = {
    system: {
      apiFootball: {
        usedToday: apiQuota.dailyCount,
        remainingToday: Math.max(0, apiQuota.dailyLimit - apiQuota.dailyCount),
        minuteUsed: apiQuota.minuteCount,
        minuteLimit: apiQuota.minuteLimit,
      },
      googleGemini: googleQuota,
      supabase: {
        configured: health.configured,
        connected: health.connected,
        tables: {
          match_records: health.tables.match_records,
          beta_recommendations: health.tables.beta_recommendations,
          beta_rolling_reports: health.tables.beta_rolling_reports,
          admin_daily_summaries: 0,
        },
      },
      cache,
      lastSyncAt: new Date().toISOString(),
    },
    analysis: {
      pendingCount: statusCounts.pending,
      verifiedCount: statusCounts.verified,
    },
  };

  const refreshed = await refreshSystemSnapshotTablesCount(systemSnapshot);
  await upsertSystemSnapshot(refreshed);

  return {
    summaryDate,
    syncedAt: refreshed.system.lastSyncAt ?? new Date().toISOString(),
  };
}

async function loadMatchRecordsForSummaryDate(summaryDate: string) {
  try {
    if (typeof window !== "undefined") {
      return [];
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    const result = await supabase
      .from("match_records")
      .select("*")
      .eq("match_date", summaryDate);

    if (result.error || !result.data) {
      return [];
    }

    return result.data.map((row) => matchRecordRowToDomain(row));
  } catch {
    return [];
  }
}

async function loadMatchStatusCounts(): Promise<{
  pending: number;
  verified: number;
}> {
  try {
    if (typeof window !== "undefined") {
      return { pending: 0, verified: 0 };
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();

    const [pendingResult, verifiedResult] = await Promise.all([
      supabase
        .from("match_records")
        .select("*", { count: "exact", head: true })
        .eq("status", "PENDING"),
      supabase
        .from("match_records")
        .select("*", { count: "exact", head: true })
        .eq("status", "VERIFIED"),
    ]);

    return {
      pending: pendingResult.count ?? 0,
      verified: verifiedResult.count ?? 0,
    };
  } catch {
    return { pending: 0, verified: 0 };
  }
}
