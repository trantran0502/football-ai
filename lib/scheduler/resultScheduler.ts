import { logAdminError } from "@/lib/admin/adminErrorLog";
import { runAdminDailyCron } from "@/lib/admin/runAdminDailyCron";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { filterTrulyPendingVerificationRecords } from "@/lib/supabase/services/matchRecordPendingPolicy";
import { runResultUpdatePipeline } from "@/lib/production/resultUpdatePipeline";
import type { ResultUpdatePipelineDependencies } from "@/lib/production/resultUpdatePipeline";
import type { ProductionResultUpdate, ResultPipelineResult } from "@/lib/production/productionTypes";
import {
  buildExecutionLogContext,
  completeExecutionLog,
  startExecutionLog,
} from "@/lib/scheduler/executionLogStore";
import { getApiFootballQuotaSnapshot } from "@/lib/providers/apiFootball/apiFootballQuota";
import { buildSchedulerDailySummary } from "@/lib/scheduler/dailySummary";
import { withRetry, withTimeout } from "@/lib/scheduler/retry";
import {
  acquireSchedulerLock,
  releaseSchedulerLock,
} from "@/lib/scheduler/schedulerLock";
import { getSchedulerConfig } from "@/lib/scheduler/schedulerConfig";
import type { ResultSchedulerResult } from "@/lib/scheduler/schedulerTypes";
import {
  attachScoresToFinishedFixtures,
  buildResultUpdatesFromFinishedFixturesWithDiagnostics,
} from "@/lib/scheduler/resultIntake";
import { intakeApiFixtures } from "@/lib/scheduler/fixtureMapping";
import type { SchedulerFixtureSource } from "@/lib/scheduler/schedulerTypes";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import {
  fetchResultUpdateFixturesByDate,
  RESULT_UPDATE_QUOTA_WARNING,
} from "@/lib/scheduler/resultUpdateFixtureFetch";

export interface ResultSchedulerDependencies {
  runDate?: string;
  ownerId?: string;
  listPending?: () => Promise<HistoricalMatchRecord[]>;
  listRecords?: () => Promise<HistoricalMatchRecord[]>;
  fetchFixtures?: (date: string) => Promise<SchedulerFixtureSource[]>;
  fetchApiFixtures?: (date: string) => Promise<ApiFootballFixtureRecord[]>;
  verifyMatch?: NonNullable<ResultUpdatePipelineDependencies["verifyMatch"]>;
  runSummaryCron?: typeof runAdminDailyCron;
}

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export async function runResultScheduler(
  dependencies: ResultSchedulerDependencies = {}
): Promise<ResultSchedulerResult> {
  const config = getSchedulerConfig();
  const runDate = dependencies.runDate ?? todayKey();
  const ownerId = dependencies.ownerId ?? crypto.randomUUID();
  const listPending =
    dependencies.listPending ??
    (async () => {
      const records = dependencies.listRecords ? await dependencies.listRecords() : [];
      return filterTrulyPendingVerificationRecords(records);
    });
  const listRecords = dependencies.listRecords ?? (async () => [] as HistoricalMatchRecord[]);
  const runSummaryCron = dependencies.runSummaryCron ?? runAdminDailyCron;

  const lock = acquireSchedulerLock({
    jobName: "result_update",
    ownerId,
    ttlMs: config.lockTtlMs,
  });

  if (!lock.acquired) {
    const skippedExecution = startExecutionLog({
      jobName: "result_update",
      runDate,
      context: buildExecutionLogContext({
        jobType: "result_update",
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
        jobType: "result_update",
        status: "skipped",
        apiFootballRequestCount: 0,
      }),
    });

    return {
      runDate,
      pendingCount: 0,
      updatesBuilt: 0,
      pipeline: emptyResultPipeline(),
      summarySynced: false,
      executionLogId: skippedExecution.id,
      skippedDueToLock: true,
      observabilityWarning: persistResult.persisted
        ? undefined
        : persistResult.persistError,
    };
  }

  const apiQuotaStart = getApiFootballQuotaSnapshot().dailyCount;

  const execution = startExecutionLog({
    jobName: "result_update",
    runDate,
    context: { ownerId },
  });

  try {
    const outcome = await withTimeout(
      (async () => {
        const pending = await listPending();

        const fetchOutcome = await fetchResultUpdateFixturesByDate(runDate, {
          fetchFromApi: dependencies.fetchApiFixtures,
          pendingRecords: pending.map((record) => ({
            fixtureId: record.fixtureId ?? null,
            homeTeam: record.homeTeam,
            awayTeam: record.awayTeam,
            matchDate: record.matchDate,
          })),
        });

        const apiFootballRequestCount = Math.max(
          0,
          getApiFootballQuotaSnapshot().dailyCount - apiQuotaStart
        );

        if (fetchOutcome.quotaSkipped) {
          await withRetry(() => runSummaryCron(runDate), {
            maxRetries: config.maxRetries,
            delayMs: config.retryDelayMs,
          });

          const records = await listRecords();
          buildSchedulerDailySummary(runDate, records);

          const warning = fetchOutcome.warning ?? RESULT_UPDATE_QUOTA_WARNING;
          const persistResult = await completeExecutionLog({
            id: execution.id,
            success: true,
            context: buildExecutionLogContext({
              jobType: "result_update",
              status: "partial_success",
              quotaSkipped: true,
              pendingCount: pending.length,
              verifiedCount: 0,
              warning,
              fixturesFetched: 0,
              analyzedCount: 0,
              skippedCount: pending.length,
              errorCount: 0,
              apiFootballRequestCount,
              updatesBuilt: 0,
              verified: 0,
              failed: 0,
              cacheHit: false,
            }),
          });

          logAdminError({
            category: "scheduler",
            message: warning,
            context: { runDate, pendingCount: pending.length },
          });

          return {
            pendingCount: pending.length,
            updatesBuilt: 0,
            pipeline: emptyResultPipeline(),
            summarySynced: true,
            executionStatus: "partial_success" as const,
            observabilityWarning: persistResult.persisted
              ? undefined
              : persistResult.persistError,
          };
        }

        const apiFixtures = fetchOutcome.fixtures;
        const rawFinishedFixtures = apiFixtures.filter((fixture) =>
          ["FT", "AET", "PEN"].includes(fixture.status)
        );

        const finishedOnly = intakeApiFixtures(rawFinishedFixtures).fixtures;

        if (dependencies.fetchFixtures) {
          const custom = await dependencies.fetchFixtures(runDate);
          for (const fixture of custom.filter((item) =>
            ["FT", "AET", "PEN"].includes(item.status)
          )) {
            if (
              !finishedOnly.some(
                (item) =>
                  item.fixtureId === fixture.fixtureId ||
                  (item.homeTeam === fixture.homeTeam &&
                    item.awayTeam === fixture.awayTeam)
              )
            ) {
              finishedOnly.push(fixture);
            }
          }
        }

        const attachOutcome = attachScoresToFinishedFixtures(finishedOnly, apiFixtures);
        const scored = attachOutcome.fixtures;
        const buildOutcome = buildResultUpdatesFromFinishedFixturesWithDiagnostics(
          pending,
          scored
        );
        const updates = buildOutcome.updates;
        const matchDiagnostics = buildOutcome.diagnostics;

        const verifyMatch =
          dependencies.verifyMatch ??
          (async () => {
            throw new Error("verifyMatch dependency is required.");
          });

        const pipeline = await withRetry(
          () =>
            runResultUpdatePipeline(updates, {
              verifyMatch,
            }),
          {
            maxRetries: config.maxRetries,
            delayMs: config.retryDelayMs,
          }
        );

        await withRetry(() => runSummaryCron(runDate), {
          maxRetries: config.maxRetries,
          delayMs: config.retryDelayMs,
        });

        const records = await listRecords();
        buildSchedulerDailySummary(runDate, records);

        const persistResult = await completeExecutionLog({
          id: execution.id,
          success: true,
          context: buildExecutionLogContext({
            jobType: "result_update",
            status: "success",
            fixturesFetched: apiFixtures.length,
            analyzedCount: pipeline.verified,
            skippedCount: pipeline.skipped,
            errorCount: pipeline.failed,
            apiFootballRequestCount,
            pendingCount: pending.length,
            updatesBuilt: updates.length,
            verified: pipeline.verified,
            failed: pipeline.failed,
            cacheHit: fetchOutcome.cacheHit,
            fixtureSource: fetchOutcome.source,
            rawFinishedFixtureCount: rawFinishedFixtures.length,
            finishedFixtureCount: finishedOnly.length,
            scoredFixtureCount: scored.length,
            matchedByFixtureId: matchDiagnostics.matchedByFixtureId,
            matchedByFallback: matchDiagnostics.matchedByFallback,
            unmatchedPendingCount: matchDiagnostics.unmatchedPendingCount,
            missingFullTimeScoreCount: attachOutcome.missingFullTimeScoreCount,
            missingHalfTimeScoreCount: attachOutcome.missingHalfTimeScoreCount,
          }),
        });

        return {
          pendingCount: pending.length,
          updatesBuilt: updates.length,
          pipeline,
          summarySynced: true,
          executionStatus: "success" as const,
          observabilityWarning: persistResult.persisted
            ? undefined
            : persistResult.persistError,
        };
      })(),
      config.jobTimeoutMs,
      "Result scheduler job timed out"
    );

    return {
      runDate,
      pendingCount: outcome.pendingCount,
      updatesBuilt: outcome.updatesBuilt,
      pipeline: outcome.pipeline,
      summarySynced: outcome.summarySynced,
      executionLogId: execution.id,
      skippedDueToLock: false,
      executionStatus: outcome.executionStatus,
      observabilityWarning: outcome.observabilityWarning,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const apiFootballRequestCount = Math.max(
      0,
      getApiFootballQuotaSnapshot().dailyCount - apiQuotaStart
    );
    await completeExecutionLog({
      id: execution.id,
      success: false,
      errorMessage: message,
      context: buildExecutionLogContext({
        jobType: "result_update",
        status: "failed",
        apiFootballRequestCount,
      }),
    });
    logAdminError({
      category: "scheduler",
      message: "Result scheduler failed",
      context: { runDate, error: message },
    });
    throw error;
  } finally {
    releaseSchedulerLock("result_update", ownerId);
  }
}

function emptyResultPipeline(): ResultPipelineResult {
  return {
    processed: 0,
    verified: 0,
    failed: 0,
    skipped: 0,
    items: [],
  };
}

export type { ProductionResultUpdate };
