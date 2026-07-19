import { getSystemSnapshotFromStore } from "@/lib/admin/adminDashboardStore";
import { loadRecentAdminErrorsFromSupabase } from "@/lib/admin/adminErrorLog";
import { getGoogleQuotaSnapshot } from "@/lib/admin/adminGoogleQuota";
import { getApiFootballQuotaSnapshot } from "@/lib/providers/apiFootball/apiFootballQuota";
import {
  aggregateApiFootballUsageForDate,
  loadRecentExecutionLogs,
  loadSchedulerRuntimeState,
} from "@/lib/scheduler/executionLogStore";
import { buildSchedulerDailySummary } from "@/lib/scheduler/dailySummary";
import { computeNextRunFromHours } from "@/lib/scheduler/cronSchedule";
import { getSchedulerConfig } from "@/lib/scheduler/schedulerConfig";
import { listActiveSchedulerLocks } from "@/lib/scheduler/schedulerLock";
import type { SchedulerStatusResponse } from "@/lib/scheduler/schedulerTypes";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { countTrulyPendingVerification } from "@/lib/supabase/services/matchRecordPendingPolicy";

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function computeNextRun(hourUtc: number, from = new Date()): string {
  const next = new Date(from);
  next.setUTCHours(hourUtc, 0, 0, 0);
  if (next.getTime() <= from.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.toISOString();
}

async function resolveApiUsage(runDate: string): Promise<SchedulerStatusResponse["apiUsage"]> {
  const memory = getApiFootballQuotaSnapshot();
  const dailyLimit = memory.dailyLimit;
  const minuteLimit = memory.minuteLimit;

  const aggregated = await aggregateApiFootballUsageForDate(runDate);
  if (aggregated !== null && aggregated > 0) {
    return {
      usedToday: aggregated,
      remainingToday: Math.max(0, dailyLimit - aggregated),
      minuteUsed: memory.minuteCount,
      minuteLimit,
    };
  }

  const snapshot = await getSystemSnapshotFromStore();
  const snapshotDay = snapshot?.system.lastSyncAt?.slice(0, 10);
  if (snapshot && snapshotDay === runDate) {
    return {
      usedToday: snapshot.system.apiFootball.usedToday,
      remainingToday: snapshot.system.apiFootball.remainingToday,
      minuteUsed: snapshot.system.apiFootball.minuteUsed,
      minuteLimit: snapshot.system.apiFootball.minuteLimit,
    };
  }

  return {
    usedToday: memory.dailyCount,
    remainingToday: Math.max(0, dailyLimit - memory.dailyCount),
    minuteUsed: memory.minuteCount,
    minuteLimit,
  };
}

export interface SchedulerStatusDependencies {
  runDate?: string;
  listRecords?: () => Promise<HistoricalMatchRecord[]>;
  countTodayFixtures?: (date: string) => Promise<number>;
}

export async function getSchedulerStatus(
  dependencies: SchedulerStatusDependencies = {}
): Promise<SchedulerStatusResponse> {
  const config = getSchedulerConfig();
  const runDate = dependencies.runDate ?? todayKey();
  const listRecords = dependencies.listRecords ?? (async () => [] as HistoricalMatchRecord[]);
  const records = await listRecords();
  const dayRecords = records.filter((record) => record.matchDate === runDate);

  const runtime = await loadSchedulerRuntimeState();
  const apiUsage = await resolveApiUsage(runDate);
  const googleQuota = getGoogleQuotaSnapshot();
  const errors = await loadRecentAdminErrorsFromSupabase(20);
  const recentExecutions = await loadRecentExecutionLogs(10);
  const locks = listActiveSchedulerLocks();
  const dailySummary = buildSchedulerDailySummary(runDate, records);

  const todayMatches =
    dependencies.countTodayFixtures !== undefined
      ? await dependencies.countTodayFixtures(runDate)
      : dayRecords.length;

  return {
    generatedAt: new Date().toISOString(),
    lastRun: {
      daily: runtime.lastDailyRun,
      result: runtime.lastResultRun,
      summary: runtime.lastSummaryRun,
    },
    nextRun: {
      daily:
        computeNextRunFromHours(config.dailyRunHoursUtc, new Date()) ??
        computeNextRun(config.dailyRunHourUtc),
      result:
        computeNextRunFromHours(config.resultRunHoursUtc, new Date()) ??
        computeNextRun(config.resultRunHourUtc),
    },
    todayMatches,
    analyzedMatches: dayRecords.length,
    validatedMatches: dayRecords.filter((record) => record.status === "VERIFIED").length,
    pendingMatches: countTrulyPendingVerification(dayRecords),
    errors: errors.filter((entry) => entry.category === "scheduler").slice(0, 10),
    apiUsage,
    googleUsage: {
      searchesToday: googleQuota.searchesToday,
      remainingToday: googleQuota.remainingToday,
      dailyLimit: googleQuota.dailyLimit,
    },
    dailySummary,
    recentExecutions,
    locks,
  };
}
