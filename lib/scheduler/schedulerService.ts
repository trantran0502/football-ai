import { loadRecentAdminErrorsFromSupabase } from "@/lib/admin/adminErrorLog";
import { getGoogleQuotaSnapshot } from "@/lib/admin/adminGoogleQuota";
import { getApiFootballQuotaSnapshot } from "@/lib/providers/apiFootball/apiFootballQuota";
import {
  getSchedulerRuntimeState,
  listExecutionLogs,
} from "@/lib/scheduler/executionLogStore";
import { buildSchedulerDailySummary } from "@/lib/scheduler/dailySummary";
import { getSchedulerConfig } from "@/lib/scheduler/schedulerConfig";
import { listActiveSchedulerLocks } from "@/lib/scheduler/schedulerLock";
import type { SchedulerStatusResponse } from "@/lib/scheduler/schedulerTypes";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";

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

  const runtime = getSchedulerRuntimeState();
  const apiQuota = getApiFootballQuotaSnapshot();
  const googleQuota = getGoogleQuotaSnapshot();
  const errors = await loadRecentAdminErrorsFromSupabase(20);
  const recentExecutions = listExecutionLogs(10);
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
      daily: computeNextRun(config.dailyRunHourUtc),
      result: computeNextRun(config.resultRunHourUtc),
    },
    todayMatches,
    analyzedMatches: dayRecords.length,
    validatedMatches: dayRecords.filter((record) => record.status === "VERIFIED").length,
    pendingMatches: dayRecords.filter((record) => record.status === "PENDING").length,
    errors: errors.filter((entry) => entry.category === "scheduler").slice(0, 10),
    apiUsage: {
      usedToday: apiQuota.dailyCount,
      remainingToday: Math.max(0, apiQuota.dailyLimit - apiQuota.dailyCount),
      minuteUsed: apiQuota.minuteCount,
      minuteLimit: apiQuota.minuteLimit,
    },
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
