export type {
  DailySchedulerResult,
  ExecutionLogEntry,
  ResultSchedulerResult,
  SchedulerConfig,
  SchedulerDailySummary,
  SchedulerFixtureSource,
  SchedulerJobName,
  SchedulerLockState,
  SchedulerRuntimeState,
  SchedulerStatusResponse,
} from "@/lib/scheduler/schedulerTypes";

export { getSchedulerConfig, isLeagueAllowed } from "@/lib/scheduler/schedulerConfig";
export {
  acquireSchedulerLock,
  listActiveSchedulerLocks,
  releaseSchedulerLock,
  resetSchedulerLocksForTests,
} from "@/lib/scheduler/schedulerLock";
export { withRetry, withTimeout } from "@/lib/scheduler/retry";
export {
  aggregateApiFootballUsageForDate,
  buildExecutionLogContext,
  completeExecutionLog,
  disableExecutionLogPersistStoreForTests,
  enableExecutionLogPersistStoreForTests,
  finishExecutionLog,
  getSchedulerRuntimeState,
  listExecutionLogs,
  loadRecentExecutionLogs,
  loadSchedulerRuntimeState,
  resetExecutionLogsForTests,
  resetPersistedExecutionLogsForTests,
  setExecutionLogPersistFailureForTests,
  startExecutionLog,
} from "@/lib/scheduler/executionLogStore";
export {
  buildSchedulerPlaceholderOdds,
} from "@/lib/scheduler/schedulerPlaceholderOdds";
export {
  buildFixtureFilterStats,
  fetchFixturesByDate,
  filterAnalyzableFixtures,
  filterFixturesByLeagueIdWhitelist,
  filterFixturesByLeagueWhitelist,
  filterFixturesBySchedulerLeaguePolicy,
  toProductionFixtures,
} from "@/lib/scheduler/fixtureIntake";
export type { FixtureFilterStats } from "@/lib/scheduler/fixtureFilterStats";
export {
  enrichAnalysisReportWithFixture,
  intakeApiFixtures,
  mapApiFixtureToSchedulerSource,
  validateApiFixtureRecord,
  toProductionFixture,
} from "@/lib/scheduler/fixtureMapping";
export type { FixtureIntakeResult, FixtureMappingSkip } from "@/lib/scheduler/fixtureMapping";
export { isSchedulerEnabled, requireSchedulerEnabled } from "@/lib/scheduler/schedulerEnabled";
export {
  attachScoresToFinishedFixtures,
  buildResultUpdatesFromFinishedFixtures,
  fetchFinishedFixturesByDate,
} from "@/lib/scheduler/resultIntake";
export {
  buildEmptySchedulerDailySummary,
  buildSchedulerDailySummary,
} from "@/lib/scheduler/dailySummary";
export { runDailyScheduler } from "@/lib/scheduler/dailyScheduler";
export type { DailySchedulerDependencies } from "@/lib/scheduler/dailyScheduler";
export { runResultScheduler } from "@/lib/scheduler/resultScheduler";
export type { ResultSchedulerDependencies } from "@/lib/scheduler/resultScheduler";
export { getSchedulerStatus } from "@/lib/scheduler/schedulerService";
export type { SchedulerStatusDependencies } from "@/lib/scheduler/schedulerService";
