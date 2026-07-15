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
import { getApiFootballQuotaSnapshot } from "@/lib/providers/apiFootball/apiFootballQuota";
import { enrichAnalysisReportWithFixture } from "@/lib/scheduler/fixtureMapping";
import {
  fetchFixturesByDate,
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
import type { DailySchedulerResult } from "@/lib/scheduler/schedulerTypes";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  attachTeamProfilesToReport,
  buildMatchTeamProfilesSnapshot,
  ensureTeamProfilesForMatch,
} from "@/lib/teamProfile";

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

async function runScheduledDailyPipeline(
  fixtures: ProductionFixture[],
  runDate: string,
  dependencies: Required<
    Pick<DailySchedulerDependencies, "saveMatch">
  > & {
    fixtureTimeoutMs: number;
    maxRetries: number;
    retryDelayMs: number;
  }
): Promise<DailyPipelineResult & { teamProfileWarnings: string[] }> {
  const items: DailyPipelineResult["items"] = [];
  let created = 0;
  let duplicates = 0;
  let failed = 0;
  const teamProfileWarnings: string[] = [];

  for (const fixture of fixtures) {
    try {
      const outcome = await withRetry(
        async () =>
          withTimeout(
            (async () => {
              let profileSnapshot = buildMatchTeamProfilesSnapshot(null, null, []);
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
                });
                profileSnapshot = profileResult.snapshot;
                teamProfileWarnings.push(...profileResult.profileWarnings);
              } catch (error) {
                const message =
                  error instanceof Error ? error.message : String(error);
                teamProfileWarnings.push(
                  `Team profile refresh failed for ${fixture.homeTeam} vs ${fixture.awayTeam}: ${message}`
                );
                logAdminError({
                  category: "scheduler",
                  message: "Team profile refresh failed",
                  context: {
                    runDate,
                    homeTeam: fixture.homeTeam,
                    awayTeam: fixture.awayTeam,
                    error: message,
                  },
                });
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
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      items.push({ fixture, status: "failed", error: message });
      logAdminError({
        category: "scheduler",
        message: `Daily fixture failed: ${fixture.homeTeam} vs ${fixture.awayTeam}`,
        context: { error: message },
      });
    }
  }

  return {
    runDate,
    processed: fixtures.length,
    created,
    duplicates,
    failed,
    items,
    teamProfileWarnings,
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
    const pipelineResult = await withTimeout(
      (async () => {
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
        const productionFixtures = toProductionFixtures(whitelisted);

        const saveMatch =
          dependencies.saveMatch ??
          (async () => {
            throw new Error("saveMatch dependency is required.");
          });

        const pipeline = await runScheduledDailyPipeline(productionFixtures, runDate, {
          saveMatch,
          fixtureTimeoutMs: config.fixtureTimeoutMs,
          maxRetries: config.maxRetries,
          retryDelayMs: config.retryDelayMs,
        });

        const records = await listRecords();
        const summary = buildSchedulerDailySummary(runDate, records);

        await withRetry(() => runSummaryCron(runDate), {
          maxRetries: config.maxRetries,
          delayMs: config.retryDelayMs,
        });

        const apiFootballRequestCount = Math.max(
          0,
          getApiFootballQuotaSnapshot().dailyCount - apiQuotaStart
        );

        const persistResult = await completeExecutionLog({
          id: execution.id,
          success: true,
          context: buildExecutionLogContext({
            jobType: "daily_analysis",
            status: "success",
            fixturesFetched: intake.fixtures.length + intake.skipped.length,
            analyzedCount: pipeline.created + pipeline.duplicates,
            skippedCount: intake.skipped.length,
            errorCount: pipeline.failed,
            apiFootballRequestCount,
            fixturesAfterWhitelist: whitelisted.length,
            created: pipeline.created,
            duplicates: pipeline.duplicates,
            failed: pipeline.failed,
            intakeWarnings,
            teamProfileWarnings: pipeline.teamProfileWarnings,
          }),
        });

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
        const summaryPersist = await completeExecutionLog({
          id: summaryExecution.id,
          success: true,
          context: buildExecutionLogContext({
            jobType: "daily_summary",
            status: "success",
            triggeredBy: "daily_analysis",
            apiFootballRequestCount: 0,
          }),
        });

        const observabilityWarning = !persistResult.persisted
          ? persistResult.persistError
          : !summaryPersist.persisted
            ? summaryPersist.persistError
            : undefined;

        return {
          fixturesFetched: intake.fixtures.length + intake.skipped.length,
          fixturesSkipped: intake.skipped.length,
          fixturesAfterWhitelist: whitelisted.length,
          pipeline,
          summary,
          intakeWarnings,
          observabilityWarning,
        };
      })(),
      config.jobTimeoutMs,
      "Daily scheduler job timed out"
    );

    return {
      runDate,
      fixturesFetched: pipelineResult.fixturesFetched,
      fixturesSkipped: pipelineResult.fixturesSkipped,
      fixturesAfterWhitelist: pipelineResult.fixturesAfterWhitelist,
      pipeline: pipelineResult.pipeline,
      summary: pipelineResult.summary,
      executionLogId: execution.id,
      skippedDueToLock: false,
      intakeWarnings: pipelineResult.intakeWarnings,
      observabilityWarning: pipelineResult.observabilityWarning,
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
