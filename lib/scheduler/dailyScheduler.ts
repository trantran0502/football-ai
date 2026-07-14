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
  finishExecutionLog,
  startExecutionLog,
} from "@/lib/scheduler/executionLogStore";
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
): Promise<DailyPipelineResult> {
  const items: DailyPipelineResult["items"] = [];
  let created = 0;
  let duplicates = 0;
  let failed = 0;

  for (const fixture of fixtures) {
    try {
      const outcome = await withRetry(
        async () =>
          withTimeout(
            (async () => {
              const report = analyzeMatch(fixture.rawOdds);
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
    return {
      runDate,
      fixturesFetched: 0,
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
      executionLogId: "",
      skippedDueToLock: true,
    };
  }

  const execution = startExecutionLog({
    jobName: "daily_analysis",
    runDate,
    context: { ownerId },
  });

  try {
    const pipelineResult = await withTimeout(
      (async () => {
        const fetched = await withRetry(() => fetchFixtures(runDate), {
          maxRetries: config.maxRetries,
          delayMs: config.retryDelayMs,
        });
        const analyzable = filterAnalyzableFixtures(fetched);
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

        finishExecutionLog({
          id: execution.id,
          success: true,
          context: {
            fixturesFetched: fetched.length,
            fixturesAfterWhitelist: whitelisted.length,
            created: pipeline.created,
            duplicates: pipeline.duplicates,
            failed: pipeline.failed,
          },
        });

        const summaryExecution = startExecutionLog({
          jobName: "daily_summary",
          runDate,
          context: { triggeredBy: "daily_analysis" },
        });
        finishExecutionLog({
          id: summaryExecution.id,
          success: true,
        });

        return {
          fixturesFetched: fetched.length,
          fixturesAfterWhitelist: whitelisted.length,
          pipeline,
          summary,
        };
      })(),
      config.jobTimeoutMs,
      "Daily scheduler job timed out"
    );

    return {
      runDate,
      fixturesFetched: pipelineResult.fixturesFetched,
      fixturesAfterWhitelist: pipelineResult.fixturesAfterWhitelist,
      pipeline: pipelineResult.pipeline,
      summary: pipelineResult.summary,
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
      message: "Daily scheduler failed",
      context: { runDate, error: message },
    });
    throw error;
  } finally {
    releaseSchedulerLock("daily_analysis", ownerId);
  }
}
