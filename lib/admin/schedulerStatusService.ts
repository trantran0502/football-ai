import { loadRecentAdminErrorsFromSupabase } from "@/lib/admin/adminErrorLog";
import { loadAdminMatchRecords } from "@/lib/admin/adminRecordLoader";
import type {
  SchedulerCronScheduleSection,
  SchedulerDataStatusSection,
  SchedulerExecutionMetrics,
  SchedulerStatusSnapshot,
  SchedulerStatusWarning,
} from "@/lib/admin/schedulerStatusTypes";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  computeNextRunFromHours,
  DEFAULT_DAILY_ANALYSIS_HOURS_UTC,
  DEFAULT_DAILY_SUMMARY_HOUR_UTC,
  DEFAULT_HISTORICAL_BACKFILL_HOUR_UTC,
  DEFAULT_RESULT_UPDATE_HOURS_UTC,
  formatUtcHourList,
} from "@/lib/scheduler/cronSchedule";
import { loadRecentExecutionLogs, aggregateApiFootballUsageForDate } from "@/lib/scheduler/executionLogStore";
import { getSchedulerConfig } from "@/lib/scheduler/schedulerConfig";
import type { ExecutionLogEntry } from "@/lib/scheduler/schedulerTypes";
import { getApiFootballQuotaSnapshot } from "@/lib/providers/apiFootball/apiFootballQuota";
import {
  countTrulyPendingVerification,
  isTrulyPendingVerification,
} from "@/lib/supabase/services/matchRecordPendingPolicy";

const MS_PER_HOUR = 60 * 60 * 1000;

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function readContextString(
  context: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const value = context?.[key];
  return typeof value === "string" ? value : null;
}

function readContextNumber(
  context: Record<string, unknown> | null | undefined,
  key: string
): number | null {
  const value = context?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readContextBoolean(
  context: Record<string, unknown> | null | undefined,
  key: string
): boolean | null {
  const value = context?.[key];
  return typeof value === "boolean" ? value : null;
}

export function buildSchedulerExecutionMetrics(
  entry: ExecutionLogEntry | null | undefined
): SchedulerExecutionMetrics {
  if (!entry) {
    return {
      executionId: null,
      jobName: null,
      runDate: null,
      startedAt: null,
      finishedAt: null,
      success: null,
      status: null,
      errorMessage: null,
      fixturesFetched: null,
      pendingCount: null,
      updatesBuilt: null,
      verified: null,
      failed: null,
      skipped: null,
      cacheHit: null,
      fixtureSource: null,
      apiFootballRequestCount: null,
      rawFinishedFixtureCount: null,
      finishedFixtureCount: null,
      scoredFixtureCount: null,
      matchedByFixtureId: null,
      matchedByFallback: null,
      unmatchedPendingCount: null,
      missingFullTimeScoreCount: null,
      missingHalfTimeScoreCount: null,
      quotaSkipped: null,
    };
  }

  const context = entry.context;
  return {
    executionId: entry.id,
    jobName: entry.jobName,
    runDate: entry.runDate,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    success: entry.success,
    status: readContextString(context, "status"),
    errorMessage: entry.errorMessage,
    fixturesFetched: readContextNumber(context, "fixturesFetched"),
    pendingCount: readContextNumber(context, "pendingCount"),
    updatesBuilt: readContextNumber(context, "updatesBuilt"),
    verified: readContextNumber(context, "verified"),
    failed: readContextNumber(context, "failed"),
    skipped: readContextNumber(context, "skippedCount"),
    cacheHit: readContextBoolean(context, "cacheHit"),
    fixtureSource: readContextString(context, "fixtureSource"),
    apiFootballRequestCount: readContextNumber(context, "apiFootballRequestCount"),
    rawFinishedFixtureCount: readContextNumber(context, "rawFinishedFixtureCount"),
    finishedFixtureCount: readContextNumber(context, "finishedFixtureCount"),
    scoredFixtureCount: readContextNumber(context, "scoredFixtureCount"),
    matchedByFixtureId: readContextNumber(context, "matchedByFixtureId"),
    matchedByFallback: readContextNumber(context, "matchedByFallback"),
    unmatchedPendingCount: readContextNumber(context, "unmatchedPendingCount"),
    missingFullTimeScoreCount: readContextNumber(context, "missingFullTimeScoreCount"),
    missingHalfTimeScoreCount: readContextNumber(context, "missingHalfTimeScoreCount"),
    quotaSkipped: readContextBoolean(context, "quotaSkipped"),
  };
}

function findLatestExecution(
  entries: ExecutionLogEntry[],
  jobName: ExecutionLogEntry["jobName"]
): ExecutionLogEntry | null {
  return entries.find((entry) => entry.jobName === jobName) ?? null;
}

function findLatestSuccessfulExecution(
  entries: ExecutionLogEntry[],
  jobName: ExecutionLogEntry["jobName"]
): ExecutionLogEntry | null {
  return (
    entries.find(
      (entry) =>
        entry.jobName === jobName &&
        entry.success &&
        readContextString(entry.context, "status") !== "skipped"
    ) ?? null
  );
}

function hoursSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) {
    return null;
  }
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return (now.getTime() - timestamp) / MS_PER_HOUR;
}

function buildDataStatusSection(
  records: HistoricalMatchRecord[],
  runDate: string,
  now: Date
): SchedulerDataStatusSection {
  const pendingRecords = records.filter((record) =>
    isTrulyPendingVerification(record, now)
  );

  let todayNewAnalysis = 0;
  let todayVerified = 0;
  let pendingOver24Hours = 0;
  let pendingOver48Hours = 0;

  for (const record of records) {
    const createdDate = record.createdAt.slice(0, 10);
    if (createdDate === runDate) {
      todayNewAnalysis += 1;
    }
    if (record.status === "VERIFIED" && record.updatedAt.slice(0, 10) === runDate) {
      todayVerified += 1;
    }
  }

  for (const record of pendingRecords) {
    const ageHours = hoursSince(record.createdAt, now);
    if (ageHours !== null && ageHours >= 24) {
      pendingOver24Hours += 1;
    }
    if (ageHours !== null && ageHours >= 48) {
      pendingOver48Hours += 1;
    }
  }

  return {
    totalAnalyzed: records.length,
    pending: countTrulyPendingVerification(records, now),
    verified: records.filter((record) => record.status === "VERIFIED").length,
    failed: records.filter((record) => record.status === "FAILED").length,
    todayNewAnalysis,
    todayVerified,
    pendingOver24Hours,
    pendingOver48Hours,
  };
}

export function buildSchedulerStatusWarnings(input: {
  now: Date;
  dailyAnalysis: SchedulerExecutionMetrics;
  resultUpdate: SchedulerExecutionMetrics;
  recentResultRuns: SchedulerExecutionMetrics[];
  dataStatus: SchedulerDataStatusSection;
  apiUsage: SchedulerStatusSnapshot["apiUsage"];
  latestSuccessfulDailyAt: string | null;
  latestSuccessfulResultAt: string | null;
}): SchedulerStatusWarning[] {
  const warnings: SchedulerStatusWarning[] = [];

  const dailyAge = hoursSince(input.latestSuccessfulDailyAt, input.now);
  if (dailyAge === null || dailyAge > 24) {
    warnings.push({
      code: "daily_analysis_stale",
      severity: "critical",
      message: "Daily Analysis 超過 24 小時未成功執行。",
    });
  }

  const resultAge = hoursSince(input.latestSuccessfulResultAt, input.now);
  if (resultAge === null || resultAge > 12) {
    warnings.push({
      code: "result_update_stale",
      severity: "critical",
      message: "Result Update 超過 12 小時未成功執行。",
    });
  }

  if (input.dataStatus.pendingOver48Hours > 0) {
    warnings.push({
      code: "pending_over_48h",
      severity: "warning",
      message: `仍有 ${input.dataStatus.pendingOver48Hours} 筆 Pending 超過 48 小時。`,
    });
  }

  const zeroUpdateRuns = input.recentResultRuns.filter(
    (entry) =>
      (entry.updatesBuilt ?? 0) === 0 &&
      (entry.pendingCount ?? 0) > 0 &&
      entry.quotaSkipped !== true
  );
  if (zeroUpdateRuns.length >= 3) {
    warnings.push({
      code: "updates_built_zero_streak",
      severity: "warning",
      message: "最近 3 次 Result Update 皆 updatesBuilt=0，但仍有 pending。",
    });
  }

  if (input.apiUsage.remainingToday <= 0) {
    warnings.push({
      code: "quota_exhausted",
      severity: "critical",
      message: "API-Football 今日 quota 已用盡。",
    });
  }

  if (input.resultUpdate.quotaSkipped) {
    warnings.push({
      code: "result_update_quota_skipped",
      severity: "critical",
      message: "最近一次 Result Update 因 quota 或 cache 問題被 skip。",
    });
  }

  if (input.dailyAnalysis.success === false || input.resultUpdate.success === false) {
    warnings.push({
      code: "execution_failed",
      severity: "critical",
      message: "最近 Scheduler execution 失敗，請查看錯誤訊息。",
    });
  }

  const unmatched = input.resultUpdate.unmatchedPendingCount ?? 0;
  const pending = input.resultUpdate.pendingCount ?? 0;
  if (pending > 0 && unmatched >= Math.max(3, Math.ceil(pending * 0.5))) {
    warnings.push({
      code: "unmatched_pending_high",
      severity: "warning",
      message: `最近一次 Result Update unmatchedPendingCount=${unmatched}，偏高。`,
    });
  }

  const fixturesFetched = input.resultUpdate.fixturesFetched ?? 0;
  const finishedFixtureCount = input.resultUpdate.finishedFixtureCount ?? 0;
  if (fixturesFetched > 0 && finishedFixtureCount === 0) {
    warnings.push({
      code: "fixtures_without_finished",
      severity: "warning",
      message: "fixturesFetched > 0 但 finishedFixtureCount = 0。",
    });
  }

  return warnings;
}

function buildCronScheduleSection(now = new Date()): SchedulerCronScheduleSection {
  const config = getSchedulerConfig();
  return {
    dailyAnalysisUtc: formatUtcHourList(
      config.dailyRunHoursUtc.length > 0
        ? config.dailyRunHoursUtc
        : [...DEFAULT_DAILY_ANALYSIS_HOURS_UTC]
    ),
    resultUpdateUtc: formatUtcHourList(
      config.resultRunHoursUtc.length > 0
        ? config.resultRunHoursUtc
        : [...DEFAULT_RESULT_UPDATE_HOURS_UTC]
    ),
    dailySummaryUtc: formatUtcHourList([DEFAULT_DAILY_SUMMARY_HOUR_UTC])[0] ?? "22:00 UTC",
    historicalBackfillUtc:
      formatUtcHourList([DEFAULT_HISTORICAL_BACKFILL_HOUR_UTC])[0] ?? "01:00 UTC",
    nextDailyRun: computeNextRunFromHours(
      config.dailyRunHoursUtc.length > 0
        ? config.dailyRunHoursUtc
        : [...DEFAULT_DAILY_ANALYSIS_HOURS_UTC],
      now
    ),
    nextResultRun: computeNextRunFromHours(
      config.resultRunHoursUtc.length > 0
        ? config.resultRunHoursUtc
        : [...DEFAULT_RESULT_UPDATE_HOURS_UTC],
      now
    ),
  };
}

export async function buildSchedulerStatusSnapshot(
  now = new Date()
): Promise<SchedulerStatusSnapshot> {
  const runDate = todayKey(now);
  const [records, recentExecutions, errors, aggregatedUsage] = await Promise.all([
    loadAdminMatchRecords(),
    loadRecentExecutionLogs(40),
    loadRecentAdminErrorsFromSupabase(10),
    aggregateApiFootballUsageForDate(runDate),
  ]);

  const quotaSnapshot = getApiFootballQuotaSnapshot();
  const usedToday = aggregatedUsage ?? quotaSnapshot.dailyCount;
  const dailyLimit = quotaSnapshot.dailyLimit;

  const latestDaily = findLatestExecution(recentExecutions, "daily_analysis");
  const latestResult = findLatestExecution(recentExecutions, "result_update");
  const latestSuccessfulDaily = findLatestSuccessfulExecution(
    recentExecutions,
    "daily_analysis"
  );
  const latestSuccessfulResult = findLatestSuccessfulExecution(
    recentExecutions,
    "result_update"
  );

  const dailyAnalysis = buildSchedulerExecutionMetrics(latestDaily);
  const resultUpdate = buildSchedulerExecutionMetrics(latestResult);
  const recentResultRuns = recentExecutions
    .filter((entry) => entry.jobName === "result_update")
    .slice(0, 5)
    .map((entry) => buildSchedulerExecutionMetrics(entry));

  const dataStatus = buildDataStatusSection(records, runDate, now);
  const apiUsage = {
    usedToday,
    remainingToday: Math.max(0, dailyLimit - usedToday),
    minuteUsed: quotaSnapshot.minuteCount,
    minuteLimit: quotaSnapshot.minuteLimit,
    dailyLimit,
  };

  const latestSchedulerError =
    errors.find((entry) => entry.category === "scheduler") ??
    errors[0] ??
    null;
  const latestError =
    resultUpdate.errorMessage ??
    dailyAnalysis.errorMessage ??
    latestSchedulerError?.message ??
    null;

  const warnings = buildSchedulerStatusWarnings({
    now,
    dailyAnalysis,
    resultUpdate,
    recentResultRuns,
    dataStatus,
    apiUsage,
    latestSuccessfulDailyAt:
      latestSuccessfulDaily?.finishedAt ?? latestSuccessfulDaily?.startedAt ?? null,
    latestSuccessfulResultAt:
      latestSuccessfulResult?.finishedAt ?? latestSuccessfulResult?.startedAt ?? null,
  });

  return {
    generatedAt: now.toISOString(),
    runDate,
    cronSchedule: buildCronScheduleSection(now),
    dailyAnalysis,
    resultUpdate,
    recentResultRuns,
    dataStatus,
    apiUsage,
    latestError,
    warnings,
  };
}
