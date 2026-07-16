import { logAdminError } from "@/lib/admin/adminErrorLog";
import { runAdminDailyCron } from "@/lib/admin/runAdminDailyCron";
import { analyzeMatch } from "@/lib/analysis/analyzeMatch";
import type { SaveMatchOutcome } from "@/lib/database/matchSchema";
import type { AnalysisReport } from "@/lib/analysis/types";
import type {
  DailyPipelineResult,
  ProductionFixture,
} from "@/lib/production/productionTypes";
import {
  buildExecutionLogContext,
  completeExecutionLog,
  startExecutionLog,
} from "@/lib/scheduler/executionLogStore";
import {
  countRemaining,
  loadDailyAnalysisQueue,
  mergeQueueWithEligibleFixtures,
  saveDailyAnalysisQueue,
  type DailyAnalysisBatchProgress,
  type DailyAnalysisQueueState,
} from "@/lib/scheduler/dailyAnalysisQueueStore";
import { getApiFootballQuotaSnapshot } from "@/lib/providers/apiFootball/apiFootballQuota";
import {
  fetchFixturesByDate,
  buildFixtureFilterStats,
  filterAnalyzableFixtures,
  filterFixturesBySchedulerLeaguePolicy,
  toProductionFixtures,
} from "@/lib/scheduler/fixtureIntake";
import { buildSchedulerDailySummary } from "@/lib/scheduler/dailySummary";
import { withRetry, withTimeout } from "@/lib/scheduler/retry";
import {
  acquireSchedulerLock,
  releaseSchedulerLock,
} from "@/lib/scheduler/schedulerLock";
import { getSchedulerConfig } from "@/lib/scheduler/schedulerConfig";
import type {
  DailySchedulerBatchProgress,
  DailySchedulerResult,
} from "@/lib/scheduler/schedulerTypes";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  attachTeamProfilesToReport,
  buildMatchTeamProfilesSnapshot,
  ensureTeamProfilesForMatch,
  loadProfilesForMatch,
} from "@/lib/teamProfile";
import type { TeamProfileTeamDiagnostic } from "@/lib/teamProfile/teamProfileTypes";
import { enrichAnalysisReportWithFixture } from "@/lib/scheduler/fixtureMapping";

export interface DailySchedulerDependencies {
  runDate?: string;
  ownerId?: string;
  fetchFixtures?: typeof fetchFixturesByDate;
  saveMatch?: (
    rawOdds: string,
    report: AnalysisReport,
    matchDate: string
  ) => Promise<SaveMatchOutcome>;
  listRecords?: () => Promise<HistoricalMatchRecord[]>;
  runSummaryCron?: typeof runAdminDailyCron;
  now?: () => number;
}

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function formatIntakeWarning(
  skip: { fixtureId: number | null; homeTeam: string | null; awayTeam: string | null; reason: string }
): string {
  const teams =
    skip.homeTeam && skip.awayTeam
      ? `${skip.homeTeam} vs ${skip.awayTeam}`
      : "unknown fixture";
  const fixtureLabel =
    skip.fixtureId !== null ? `fixture ${skip.fixtureId}` : "fixture unknown";
  return `Skipped ${fixtureLabel} (${teams}): ${skip.reason}`;
}

function teamProfileKey(
  teamId: number,
  leagueId: number | null,
  season: number | null
): string {
  return `${teamId}:${leagueId ?? -1}:${season ?? -1}`;
}

function selectFixtureBatch(
  fixtures: ProductionFixture[],
  queue: DailyAnalysisQueueState,
  maxPerRun: number
): {
  batch: ProductionFixture[];
  cursorBefore: number;
  cursorAfter: number;
} {
  const byId = new Map(fixtures.map((fixture) => [fixture.fixtureId, fixture]));
  const batch: ProductionFixture[] = [];
  let cursor = queue.cursor;
  const cursorBefore = cursor;

  while (batch.length < maxPerRun && cursor < queue.fixtureIds.length) {
    const fixtureId = queue.fixtureIds[cursor];
    cursor += 1;

    if (
      queue.completedFixtureIds.includes(fixtureId) ||
      queue.failedFixtureIds.includes(fixtureId)
    ) {
      continue;
    }

    const fixture = byId.get(fixtureId);
    if (fixture) {
      batch.push(fixture);
    }
  }

  return { batch, cursorBefore, cursorAfter: cursor };
}

async function runBatchedDailyPipeline(
  fixtures: ProductionFixture[],
  runDate: string,
  queue: DailyAnalysisQueueState,
  dependencies: Required<Pick<DailySchedulerDependencies, "saveMatch">> & {
    fixtureTimeoutMs: number;
    maxRetries: number;
    retryDelayMs: number;
    maxFixturesPerRun: number;
    maxTeamProfileRefreshesPerRun: number;
    timeBudgetDeadline: number;
    now: () => number;
  }
): Promise<
  DailyPipelineResult & {
    teamProfileWarnings: string[];
    teamProfileDiagnostics: TeamProfileTeamDiagnostic[];
    teamProfileApiRequestCount: number;
    batchProgress: DailyAnalysisBatchProgress;
    updatedQueue: DailyAnalysisQueueState;
  }
> {
  const items: DailyPipelineResult["items"] = [];
  let created = 0;
  let duplicates = 0;
  let failed = 0;
  const teamProfileWarnings: string[] = [];
  const teamProfileDiagnostics: TeamProfileTeamDiagnostic[] = [];
  const deferredFixtures: number[] = [];
  const deferredTeamProfiles: string[] = [];
  const teamProfileQuotaStart = getApiFootballQuotaSnapshot().dailyCount;
  const startedAt = dependencies.now();
  let teamProfileRefreshesUsed = 0;
  let timeBudgetReached = false;

  const { batch, cursorBefore, cursorAfter } = selectFixtureBatch(
    fixtures,
    queue,
    dependencies.maxFixturesPerRun
  );

  const updatedQueue: DailyAnalysisQueueState = {
    ...queue,
    cursor: cursorAfter,
    deferredFixtureIds: [...queue.deferredFixtureIds],
    deferredTeamProfileKeys: [...queue.deferredTeamProfileKeys],
  };

  for (const fixture of batch) {
    if (dependencies.now() >= dependencies.timeBudgetDeadline) {
      timeBudgetReached = true;
      if (
        !updatedQueue.completedFixtureIds.includes(fixture.fixtureId) &&
        !updatedQueue.failedFixtureIds.includes(fixture.fixtureId)
      ) {
        deferredFixtures.push(fixture.fixtureId);
        if (!updatedQueue.deferredFixtureIds.includes(fixture.fixtureId)) {
          updatedQueue.deferredFixtureIds.push(fixture.fixtureId);
        }
      }
      break;
    }

    try {
      const outcome = await withRetry(
        async () =>
          withTimeout(
            (async () => {
              let profileSnapshot = buildMatchTeamProfilesSnapshot(null, null, []);
              const canAttemptProfileRefresh =
                teamProfileRefreshesUsed + 2 <=
                dependencies.maxTeamProfileRefreshesPerRun;

              if (canAttemptProfileRefresh) {
                try {
                  const profileResult = await ensureTeamProfilesForMatch({
                    runDate,
                    homeTeamId: fixture.homeTeamId,
                    awayTeamId: fixture.awayTeamId,
                    homeTeamName: fixture.homeTeam,
                    awayTeamName: fixture.awayTeam,
                    leagueId: fixture.leagueId,
                    leagueName: fixture.leagueName,
                    season: fixture.season,
                    waitForQuota: false,
                    skipDeferredRetry: true,
                  });
                  profileSnapshot = profileResult.snapshot;
                  teamProfileWarnings.push(...profileResult.profileWarnings);
                  teamProfileDiagnostics.push(...profileResult.profileDiagnostics);
                  teamProfileRefreshesUsed += 2;

                  for (const diagnostic of profileResult.profileDiagnostics) {
                    if (diagnostic.skippedReason === "quota_exhausted") {
                      const key = teamProfileKey(
                        diagnostic.teamId,
                        fixture.leagueId,
                        fixture.season
                      );
                      if (!deferredTeamProfiles.includes(key)) {
                        deferredTeamProfiles.push(key);
                      }
                      if (!updatedQueue.deferredTeamProfileKeys.includes(key)) {
                        updatedQueue.deferredTeamProfileKeys.push(key);
                      }
                    }
                  }
                } catch (error) {
                  const message =
                    error instanceof Error ? error.message : String(error);
                  teamProfileWarnings.push(
                    `Team profile refresh failed for ${fixture.homeTeam} vs ${fixture.awayTeam}: ${message}`
                  );
                  profileSnapshot = await loadProfilesForMatch({
                    homeTeamId: fixture.homeTeamId,
                    awayTeamId: fixture.awayTeamId,
                    leagueId: fixture.leagueId,
                    season: fixture.season,
                  });
                }
              } else {
                profileSnapshot = await loadProfilesForMatch({
                  homeTeamId: fixture.homeTeamId,
                  awayTeamId: fixture.awayTeamId,
                  leagueId: fixture.leagueId,
                  season: fixture.season,
                });
                const homeKey = teamProfileKey(
                  fixture.homeTeamId,
                  fixture.leagueId,
                  fixture.season
                );
                const awayKey = teamProfileKey(
                  fixture.awayTeamId,
                  fixture.leagueId,
                  fixture.season
                );
                for (const key of [homeKey, awayKey]) {
                  if (!deferredTeamProfiles.includes(key)) {
                    deferredTeamProfiles.push(key);
                  }
                  if (!updatedQueue.deferredTeamProfileKeys.includes(key)) {
                    updatedQueue.deferredTeamProfileKeys.push(key);
                  }
                }
                teamProfileWarnings.push(
                  `Team profile refresh deferred for ${fixture.homeTeam} vs ${fixture.awayTeam} due to scheduler profile budget or quota.`
                );
              }

              const report = attachTeamProfilesToReport(
                enrichAnalysisReportWithFixture(
                  analyzeMatch(fixture.rawOdds),
                  fixture
                ),
                profileSnapshot
              );
              return dependencies.saveMatch(fixture.rawOdds, report, fixture.matchDate);
            })(),
            dependencies.fixtureTimeoutMs,
            `Fixture analysis timed out: ${fixture.homeTeam} vs ${fixture.awayTeam}`
          ),
        {
          maxRetries: dependencies.maxRetries,
          delayMs: dependencies.retryDelayMs,
          onRetry: (attempt, error) => {
            logAdminError({
              category: "scheduler",
              message: `Daily fixture retry ${attempt}: ${fixture.homeTeam} vs ${fixture.awayTeam}`,
              context: {
                error: error instanceof Error ? error.message : String(error),
              },
            });
          },
        }
      );

      if (outcome.status === "created") {
        created += 1;
        items.push({ fixture, status: "created", matchId: outcome.record.id });
      } else {
        duplicates += 1;
        items.push({ fixture, status: "duplicate", matchId: outcome.record.id });
      }

      if (!updatedQueue.completedFixtureIds.includes(fixture.fixtureId)) {
        updatedQueue.completedFixtureIds.push(fixture.fixtureId);
      }
      updatedQueue.deferredFixtureIds = updatedQueue.deferredFixtureIds.filter(
        (fixtureId) => fixtureId !== fixture.fixtureId
      );
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      items.push({ fixture, status: "failed", error: message });
      if (!updatedQueue.failedFixtureIds.includes(fixture.fixtureId)) {
        updatedQueue.failedFixtureIds.push(fixture.fixtureId);
      }
      logAdminError({
        category: "scheduler",
        message: `Daily fixture failed: ${fixture.homeTeam} vs ${fixture.awayTeam}`,
        context: { error: message },
      });
    }

    if (dependencies.now() >= dependencies.timeBudgetDeadline) {
      timeBudgetReached = true;
    }
  }

  const executionDurationMs = dependencies.now() - startedAt;
  const remaining = countRemaining(updatedQueue);
  const batchProgress: DailyAnalysisBatchProgress = {
    totalEligible: updatedQueue.fixtureIds.length,
    processedThisRun: items.length,
    remaining,
    cursorBefore,
    cursorAfter: updatedQueue.cursor,
    deferredFixtures,
    deferredTeamProfiles,
    timeBudgetReached,
    executionDurationMs,
  };

  return {
    runDate,
    processed: items.length,
    created,
    duplicates,
    failed,
    items,
    teamProfileWarnings,
    teamProfileDiagnostics,
    teamProfileApiRequestCount: Math.max(
      0,
      getApiFootballQuotaSnapshot().dailyCount - teamProfileQuotaStart
    ),
    batchProgress,
    updatedQueue,
  };
}

function syncQueueWithExistingRecords(
  queue: DailyAnalysisQueueState,
  fixtures: ProductionFixture[],
  records: HistoricalMatchRecord[]
): DailyAnalysisQueueState {
  const recordKeys = new Set(
    records.map((record) => `${record.matchDate}:${record.homeTeam}:${record.awayTeam}`)
  );
  const completed = new Set(queue.completedFixtureIds);

  for (const fixture of fixtures) {
    const key = `${fixture.matchDate}:${fixture.homeTeam}:${fixture.awayTeam}`;
    if (recordKeys.has(key)) {
      completed.add(fixture.fixtureId);
    }
  }

  return {
    ...queue,
    completedFixtureIds: [...completed],
  };
}

export async function runDailyScheduler(
  dependencies: DailySchedulerDependencies = {}
): Promise<DailySchedulerResult> {
  const config = getSchedulerConfig();
  const runDate = dependencies.runDate ?? todayKey();
  const ownerId = dependencies.ownerId ?? crypto.randomUUID();
  const fetchFixtures = dependencies.fetchFixtures ?? fetchFixturesByDate;
  const listRecords = dependencies.listRecords ?? (async () => [] as HistoricalMatchRecord[]);
  const runSummaryCron = dependencies.runSummaryCron ?? runAdminDailyCron;
  const now = dependencies.now ?? (() => Date.now());
  const executionStartedAt = now();

  const lock = acquireSchedulerLock({
    jobName: "daily_analysis",
    ownerId,
    ttlMs: config.lockTtlMs,
  });

  if (!lock.acquired) {
    const skippedExecution = startExecutionLog({
      jobName: "daily_analysis",
      runDate,
      context: buildExecutionLogContext({
        jobType: "daily_analysis",
        status: "skipped",
        fixturesFetched: 0,
        analyzedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        apiFootballRequestCount: 0,
        reason: "lock_held",
        ownerId,
      }),
    });
    const persistResult = await completeExecutionLog({
      id: skippedExecution.id,
      success: false,
      errorMessage: "Skipped due to active scheduler lock.",
      context: buildExecutionLogContext({
        jobType: "daily_analysis",
        status: "skipped",
        fixturesFetched: 0,
        analyzedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        apiFootballRequestCount: 0,
      }),
    });

    return {
      runDate,
      fixturesFetched: 0,
      fixturesSkipped: 0,
      fixturesAfterWhitelist: 0,
      pipeline: {
        runDate,
        processed: 0,
        created: 0,
        duplicates: 0,
        failed: 0,
        items: [],
      },
      summary: buildSchedulerDailySummary(runDate, await listRecords()),
      executionLogId: skippedExecution.id,
      skippedDueToLock: true,
      intakeWarnings: [],
      executionStatus: "skipped",
      observabilityWarning: persistResult.persisted
        ? undefined
        : persistResult.persistError,
    };
  }

  const apiQuotaStart = getApiFootballQuotaSnapshot().dailyCount;

  const execution = startExecutionLog({
    jobName: "daily_analysis",
    runDate,
    context: { ownerId },
  });

  try {
    const intake = await withRetry(() => fetchFixtures(runDate), {
      maxRetries: config.maxRetries,
      delayMs: config.retryDelayMs,
    });
    const intakeWarnings = intake.skipped.map(formatIntakeWarning);

    for (const warning of intakeWarnings) {
      logAdminError({
        category: "scheduler",
        message: warning,
        context: { runDate, phase: "fixture_intake" },
      });
    }

    const analyzable = filterAnalyzableFixtures(intake.fixtures);
    const whitelisted = filterFixturesBySchedulerLeaguePolicy(analyzable, {
      leagueIdWhitelist: config.leagueIdWhitelist,
      leagueWhitelist: config.leagueWhitelist,
    });
    const filterStats = buildFixtureFilterStats(intake, {
      leagueIdWhitelist: config.leagueIdWhitelist,
      leagueWhitelist: config.leagueWhitelist,
    });
    const productionFixtures = toProductionFixtures(whitelisted);

    const existingQueue = await loadDailyAnalysisQueue(runDate);
    let queue = mergeQueueWithEligibleFixtures(
      existingQueue,
      runDate,
      productionFixtures.map((fixture) => fixture.fixtureId)
    );
    const records = await listRecords();
    queue = syncQueueWithExistingRecords(queue, productionFixtures, records);

    const saveMatch =
      dependencies.saveMatch ??
      (async () => {
        throw new Error("saveMatch dependency is required.");
      });

    const timeBudgetDeadline = executionStartedAt + config.timeBudgetMs;
    const pipeline = await runBatchedDailyPipeline(
      productionFixtures,
      runDate,
      queue,
      {
        saveMatch,
        fixtureTimeoutMs: config.fixtureTimeoutMs,
        maxRetries: config.maxRetries,
        retryDelayMs: config.retryDelayMs,
        maxFixturesPerRun: config.maxFixturesPerRun,
        maxTeamProfileRefreshesPerRun: config.maxTeamProfileRefreshesPerRun,
        timeBudgetDeadline,
        now,
      }
    );

    queue = pipeline.updatedQueue;
    await saveDailyAnalysisQueue(queue);

    const summary = buildSchedulerDailySummary(runDate, records);

    const queueCompleted = countRemaining(queue) === 0;
    if (queueCompleted) {
      await withRetry(() => runSummaryCron(runDate), {
        maxRetries: config.maxRetries,
        delayMs: config.retryDelayMs,
      });
    }

    const apiFootballRequestCount = Math.max(
      0,
      getApiFootballQuotaSnapshot().dailyCount - apiQuotaStart
    );
    const executionDurationMs = now() - executionStartedAt;
    const executionStatus = queueCompleted ? "success" : "partial_success";

    const persistResult = await completeExecutionLog({
      id: execution.id,
      success: true,
      context: buildExecutionLogContext({
        jobType: "daily_analysis",
        status: executionStatus,
        fixturesFetched: intake.fixtures.length + intake.skipped.length,
        analyzedCount: pipeline.created + pipeline.duplicates,
        skippedCount: intake.skipped.length,
        errorCount: pipeline.failed,
        apiFootballRequestCount,
        teamProfileApiRequestCount: pipeline.teamProfileApiRequestCount,
        fixturesAfterWhitelist: whitelisted.length,
        filterStats: filterStats as unknown as Record<string, unknown>,
        created: pipeline.created,
        duplicates: pipeline.duplicates,
        failed: pipeline.failed,
        intakeWarnings,
        teamProfileWarnings: pipeline.teamProfileWarnings,
        teamProfileDiagnostics: pipeline.teamProfileDiagnostics,
        totalEligible: pipeline.batchProgress.totalEligible,
        processedThisRun: pipeline.batchProgress.processedThisRun,
        remaining: pipeline.batchProgress.remaining,
        cursorBefore: pipeline.batchProgress.cursorBefore,
        cursorAfter: pipeline.batchProgress.cursorAfter,
        deferredFixtures: pipeline.batchProgress.deferredFixtures,
        deferredTeamProfiles: pipeline.batchProgress.deferredTeamProfiles,
        timeBudgetReached: pipeline.batchProgress.timeBudgetReached,
        executionDurationMs,
        queueStatus: queue.status,
      }),
    });

    if (queueCompleted) {
      const summaryExecution = startExecutionLog({
        jobName: "daily_summary",
        runDate,
        context: buildExecutionLogContext({
          jobType: "daily_summary",
          status: "success",
          triggeredBy: "daily_analysis",
          apiFootballRequestCount: 0,
        }),
      });
      await completeExecutionLog({
        id: summaryExecution.id,
        success: true,
        context: buildExecutionLogContext({
          jobType: "daily_summary",
          status: "success",
          triggeredBy: "daily_analysis",
          apiFootballRequestCount: 0,
        }),
      });
    }

    const observabilityWarning = persistResult.persisted
      ? undefined
      : persistResult.persistError;

    return {
      runDate,
      fixturesFetched: intake.fixtures.length + intake.skipped.length,
      fixturesSkipped: intake.skipped.length,
      fixturesAfterWhitelist: whitelisted.length,
      pipeline,
      summary,
      intakeWarnings,
      observabilityWarning,
      executionLogId: execution.id,
      skippedDueToLock: false,
      batchProgress: pipeline.batchProgress,
      executionStatus,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const apiFootballRequestCount = Math.max(
      0,
      getApiFootballQuotaSnapshot().dailyCount - apiQuotaStart
    );
    const persistResult = await completeExecutionLog({
      id: execution.id,
      success: false,
      errorMessage: message,
      context: buildExecutionLogContext({
        jobType: "daily_analysis",
        status: "failed",
        apiFootballRequestCount,
        executionDurationMs: now() - executionStartedAt,
      }),
    });
    logAdminError({
      category: "scheduler",
      message: "Daily scheduler failed",
      context: { runDate, error: message },
    });
    const observabilityError = new Error(message) as Error & {
      observabilityWarning?: string;
    };
    if (!persistResult.persisted) {
      observabilityError.observabilityWarning = persistResult.persistError;
    }
    throw observabilityError;
  } finally {
    releaseSchedulerLock("daily_analysis", ownerId);
  }
}
