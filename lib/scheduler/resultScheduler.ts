import { logAdminError } from "@/lib/admin/adminErrorLog";
import { runAdminDailyCron } from "@/lib/admin/runAdminDailyCron";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { runResultUpdatePipeline } from "@/lib/production/resultUpdatePipeline";
import type { ResultUpdatePipelineDependencies } from "@/lib/production/resultUpdatePipeline";
import type { ProductionResultUpdate, ResultPipelineResult } from "@/lib/production/productionTypes";
import {
  finishExecutionLog,
  startExecutionLog,
} from "@/lib/scheduler/executionLogStore";
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
import { mapApiFixtureToSource } from "@/lib/scheduler/fixtureIntake";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import { getApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";

export interface ResultSchedulerDependencies {
  runDate?: string;
  ownerId?: string;
  listPending?: () => Promise<HistoricalMatchRecord[]>;
  listRecords?: () => Promise<HistoricalMatchRecord[]>;
  fetchFixtures?: (date: string) => Promise<ReturnType<typeof mapApiFixtureToSource>[]>;
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
    return {
      runDate,
      pendingCount: 0,
      updatesBuilt: 0,
      pipeline: emptyResultPipeline(),
      summarySynced: false,
      executionLogId: "",
      skippedDueToLock: true,
    };
  }

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

        const finishedOnly = apiFixtures
          .filter((fixture) => ["FT", "AET", "PEN"].includes(fixture.status))
          .map(mapApiFixtureToSource);

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

        finishExecutionLog({
          id: execution.id,
          success: true,
          context: {
            pendingCount: pending.length,
            updatesBuilt: updates.length,
            verified: pipeline.verified,
            failed: pipeline.failed,
          },
        });

        return {
          pendingCount: pending.length,
          updatesBuilt: updates.length,
          pipeline,
          summarySynced: true,
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
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishExecutionLog({
      id: execution.id,
      success: false,
      errorMessage: message,
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
