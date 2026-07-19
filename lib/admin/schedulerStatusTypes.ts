import type { ExecutionLogEntry } from "@/lib/scheduler/schedulerTypes";

export interface SchedulerExecutionMetrics {
  executionId: string | null;
  jobName: ExecutionLogEntry["jobName"] | null;
  runDate: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  success: boolean | null;
  status: string | null;
  errorMessage: string | null;
  fixturesFetched: number | null;
  pendingCount: number | null;
  updatesBuilt: number | null;
  verified: number | null;
  failed: number | null;
  skipped: number | null;
  cacheHit: boolean | null;
  fixtureSource: string | null;
  apiFootballRequestCount: number | null;
  rawFinishedFixtureCount: number | null;
  finishedFixtureCount: number | null;
  scoredFixtureCount: number | null;
  matchedByFixtureId: number | null;
  matchedByFallback: number | null;
  unmatchedPendingCount: number | null;
  missingFullTimeScoreCount: number | null;
  missingHalfTimeScoreCount: number | null;
  quotaSkipped: boolean | null;
}

export interface SchedulerDataStatusSection {
  totalAnalyzed: number;
  pending: number;
  verified: number;
  failed: number;
  todayNewAnalysis: number;
  todayVerified: number;
  pendingOver24Hours: number;
  pendingOver48Hours: number;
}

export interface SchedulerApiUsageSection {
  usedToday: number;
  remainingToday: number;
  minuteUsed: number;
  minuteLimit: number;
  dailyLimit: number;
}

export interface SchedulerCronScheduleSection {
  dailyAnalysisUtc: string[];
  resultUpdateUtc: string[];
  dailySummaryUtc: string;
  historicalBackfillUtc: string;
  nextDailyRun: string | null;
  nextResultRun: string | null;
}

export interface SchedulerStatusWarning {
  code: string;
  severity: "warning" | "critical";
  message: string;
}

export interface SchedulerStatusSnapshot {
  generatedAt: string;
  runDate: string;
  cronSchedule: SchedulerCronScheduleSection;
  dailyAnalysis: SchedulerExecutionMetrics;
  resultUpdate: SchedulerExecutionMetrics;
  recentResultRuns: SchedulerExecutionMetrics[];
  dataStatus: SchedulerDataStatusSection;
  apiUsage: SchedulerApiUsageSection;
  latestError: string | null;
  warnings: SchedulerStatusWarning[];
}
