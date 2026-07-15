import { logAdminError } from "@/lib/admin/adminErrorLog";
import { runAdminDailyCron } from "@/lib/admin/runAdminDailyCron";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
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
  buildResultUpdatesFromFinishedFixtures,
} from "@/lib/scheduler/resultIntake";
import { intakeApiFixtures } from "@/lib/scheduler/fixtureMapping";
import type { SchedulerFixtureSource } from "@/lib/scheduler/schedulerTypes";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import { getApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";

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
      return records.filter((record) => record.status === "PENDING");
    });
  const listRecords = dependencies.listRecords ?? (async () => [] as HistoricalMatchRecord[]);
  const fetchApiFixtures =
    dependencies.fetchApiFixtures ??
    (async (date: string) => {
      const client = getApiFootballClient();
      if (!client.isConfigured()) {
        return [];
      }
      return client.getFixturesByDate(date);
    });
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
        const apiFixtures = await withRetry(() => fetchApiFixtures(runDate), {
          maxRetries: config.maxRetries,
          delayMs: config.retryDelayMs,
        });

        const finishedOnly = intakeApiFixtures(
          apiFixtures.filter((fixture) => ["FT", "AET", "PEN"].includes(fixture.status))
        ).fixtures;

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

        const scored = attachScoresToFinishedFixtures(finishedOnly, apiFixtures);
        const updates = buildResultUpdatesFromFinishedFixtures(pending, scored);

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

        const apiFootballRequestCount = Math.max(
          0,
          getApiFootballQuotaSnapshot().dailyCount - apiQuotaStart
        );

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
          }),
        });

        return {
          pendingCount: pending.length,
          updatesBuilt: updates.length,
          pipeline,
          summarySynced: true,
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
