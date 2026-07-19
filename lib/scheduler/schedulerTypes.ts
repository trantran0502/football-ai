import type { DailyPipelineResult } from "@/lib/production/productionTypes";
import type { ResultPipelineResult } from "@/lib/production/productionTypes";
import type { AdminErrorLogEntry } from "@/lib/admin/adminDashboardTypes";

export type SchedulerJobName =
  | "daily_analysis"
  | "result_update"
  | "daily_summary"
  | "historical_match_backfill";

export interface ExecutionLogEntry {
  id: string;
  jobName: SchedulerJobName;
  runDate: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  success: boolean;
  errorMessage: string | null;
  context: Record<string, unknown> | null;
}

export interface SchedulerLockState {
  jobName: SchedulerJobName;
  lockedAt: string;
  expiresAt: string;
  ownerId: string;
}

export interface SchedulerRuntimeState {
  lastDailyRun: string | null;
  lastResultRun: string | null;
  lastSummaryRun: string | null;
  nextDailyRun: string | null;
  nextResultRun: string | null;
  locks: SchedulerLockState[];
}

export interface SchedulerDailySummary {
  summaryDate: string;
  analyzedCount: number;
  passCount: number;
  recommendedCount: number;
  recommendationsByMarket: Record<string, number>;
  recommendationsByLeague: Record<string, number>;
  pendingCount: number;
  verifiedCount: number;
  todayRoi: number;
  cumulativeRoi: number;
}

export interface SchedulerStatusResponse {
  generatedAt: string;
  lastRun: {
    daily: string | null;
    result: string | null;
    summary: string | null;
  };
  nextRun: {
    daily: string | null;
    result: string | null;
  };
  todayMatches: number;
  analyzedMatches: number;
  validatedMatches: number;
  pendingMatches: number;
  errors: AdminErrorLogEntry[];
  apiUsage: {
    usedToday: number;
    remainingToday: number;
    minuteUsed: number;
    minuteLimit: number;
  };
  googleUsage: {
    searchesToday: number;
    remainingToday: number | null;
    dailyLimit: number | null;
  };
  dailySummary: SchedulerDailySummary | null;
  recentExecutions: ExecutionLogEntry[];
  locks: SchedulerLockState[];
}

export interface DailySchedulerBatchProgress {
  totalEligible: number;
  processedThisRun: number;
  remaining: number;
  cursorBefore: number;
  cursorAfter: number;
  deferredFixtures: number[];
  deferredTeamProfiles: string[];
  timeBudgetReached: boolean;
  executionDurationMs: number;
}

export interface DailySchedulerResult {
  runDate: string;
  fixturesFetched: number;
  fixturesSkipped: number;
  fixturesAfterWhitelist: number;
  pipeline: DailyPipelineResult;
  summary: SchedulerDailySummary;
  executionLogId: string;
  skippedDueToLock: boolean;
  intakeWarnings: string[];
  observabilityWarning?: string;
  batchProgress?: DailySchedulerBatchProgress;
  executionStatus?: "success" | "partial_success" | "failed" | "skipped";
}

export interface ResultSchedulerResult {
  runDate: string;
  pendingCount: number;
  updatesBuilt: number;
  pipeline: ResultPipelineResult;
  summarySynced: boolean;
  executionLogId: string;
  skippedDueToLock: boolean;
  observabilityWarning?: string;
  executionStatus?: "success" | "partial_success" | "failed" | "skipped";
}

export interface HistoricalMatchBackfillResult {
  cursor: {
    currentDate: string;
    minDate: string;
    status: "in_progress" | "completed";
    updatedAt: string;
    planMinDate?: string | null;
    planMaxDate?: string | null;
  } | null;
  stats: {
    fetched: number;
    inserted: number;
    duplicates: number;
    skipped: number;
    apiRequests: number;
    datesProcessed: number;
  };
  executionLogId: string;
  skippedDueToLock: boolean;
  executionStatus?: "success" | "partial_success";
  warnings?: string[];
  observabilityWarning?: string;
}

export interface SchedulerConfig {
  leagueWhitelist: string[];
  leagueIdWhitelist: number[];
  dailyRunHoursUtc: number[];
  resultRunHoursUtc: number[];
  dailyRunHourUtc: number;
  resultRunHourUtc: number;
  lockTtlMs: number;
  fixtureTimeoutMs: number;
  jobTimeoutMs: number;
  timeBudgetMs: number;
  maxFixturesPerRun: number;
  maxTeamProfileRefreshesPerRun: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface SchedulerFixtureSource {
  fixtureId: number;
  matchDate: string;
  league: string;
  leagueName: string;
  leagueId: number | null;
  season: number | null;
  kickoffTime: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  status: string;
  rawOdds?: string;
}
