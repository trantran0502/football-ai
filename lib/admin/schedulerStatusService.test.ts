import type { ExecutionLogEntry } from "@/lib/scheduler/schedulerTypes";
import {
  buildSchedulerExecutionMetrics,
  buildSchedulerStatusWarnings,
} from "@/lib/admin/schedulerStatusService";
import { computeNextRunFromHours } from "@/lib/scheduler/cronSchedule";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function buildExecutionEntry(
  overrides: Partial<ExecutionLogEntry> = {}
): ExecutionLogEntry {
  return {
    id: overrides.id ?? "exec-1",
    jobName: overrides.jobName ?? "result_update",
    runDate: overrides.runDate ?? "2026-07-19",
    startedAt: overrides.startedAt ?? "2026-07-19T12:00:00.000Z",
    finishedAt: overrides.finishedAt ?? "2026-07-19T12:01:00.000Z",
    durationMs: 60_000,
    success: overrides.success ?? true,
    errorMessage: overrides.errorMessage ?? null,
    context: overrides.context ?? {
      status: "success",
      fixturesFetched: 204,
      pendingCount: 14,
      updatesBuilt: 2,
      verified: 2,
      failed: 0,
      skippedCount: 0,
      finishedFixtureCount: 12,
      scoredFixtureCount: 10,
      unmatchedPendingCount: 12,
    },
  };
}

function testBuildSchedulerExecutionMetrics(): void {
  const metrics = buildSchedulerExecutionMetrics(
    buildExecutionEntry({
      context: {
        status: "success",
        fixturesFetched: 204,
        pendingCount: 14,
        updatesBuilt: 2,
        verified: 2,
        failed: 0,
        skippedCount: 0,
        cacheHit: true,
        fixtureSource: "api",
        apiFootballRequestCount: 1,
        rawFinishedFixtureCount: 15,
        finishedFixtureCount: 12,
        scoredFixtureCount: 10,
        matchedByFixtureId: 2,
        matchedByFallback: 0,
        unmatchedPendingCount: 12,
        missingHalfTimeScoreCount: 3,
      },
    })
  );

  assert(metrics.updatesBuilt === 2, "updatesBuilt should be parsed");
  assert(metrics.matchedByFixtureId === 2, "matchedByFixtureId should be parsed");
  assert(metrics.cacheHit === true, "cacheHit should be parsed");
}

function testWarningsForStaleJobs(): void {
  const now = new Date("2026-07-19T12:00:00.000Z");
  const warnings = buildSchedulerStatusWarnings({
    now,
    dailyAnalysis: buildSchedulerExecutionMetrics(
      buildExecutionEntry({
        jobName: "daily_analysis",
        startedAt: "2026-07-17T00:00:00.000Z",
        finishedAt: "2026-07-17T00:01:00.000Z",
      })
    ),
    resultUpdate: buildSchedulerExecutionMetrics(buildExecutionEntry()),
    recentResultRuns: [buildSchedulerExecutionMetrics(buildExecutionEntry())],
    dataStatus: {
      totalAnalyzed: 20,
      pending: 14,
      verified: 6,
      failed: 0,
      todayNewAnalysis: 3,
      todayVerified: 2,
      pendingOver24Hours: 1,
      pendingOver48Hours: 0,
    },
    apiUsage: {
      usedToday: 20,
      remainingToday: 80,
      minuteUsed: 1,
      minuteLimit: 10,
      dailyLimit: 100,
    },
    latestSuccessfulDailyAt: "2026-07-17T00:01:00.000Z",
    latestSuccessfulResultAt: "2026-07-19T11:00:00.000Z",
  });

  assert(
    warnings.some((warning) => warning.code === "daily_analysis_stale"),
    "stale daily analysis should warn"
  );
  assert(
    !warnings.some((warning) => warning.code === "result_update_stale"),
    "recent result update should not warn"
  );
}

function testWarningsForQuotaAndFinishedFixtures(): void {
  const warnings = buildSchedulerStatusWarnings({
    now: new Date("2026-07-19T12:00:00.000Z"),
    dailyAnalysis: buildSchedulerExecutionMetrics(buildExecutionEntry({ jobName: "daily_analysis" })),
    resultUpdate: buildSchedulerExecutionMetrics(
      buildExecutionEntry({
        context: {
          status: "success",
          fixturesFetched: 100,
          finishedFixtureCount: 0,
          pendingCount: 5,
          updatesBuilt: 0,
          quotaSkipped: true,
        },
      })
    ),
    recentResultRuns: [
      buildSchedulerExecutionMetrics(
        buildExecutionEntry({ context: { pendingCount: 5, updatesBuilt: 0 } })
      ),
      buildSchedulerExecutionMetrics(
        buildExecutionEntry({ context: { pendingCount: 5, updatesBuilt: 0 } })
      ),
      buildSchedulerExecutionMetrics(
        buildExecutionEntry({ context: { pendingCount: 5, updatesBuilt: 0 } })
      ),
    ],
    dataStatus: {
      totalAnalyzed: 20,
      pending: 14,
      verified: 6,
      failed: 0,
      todayNewAnalysis: 3,
      todayVerified: 2,
      pendingOver24Hours: 0,
      pendingOver48Hours: 2,
    },
    apiUsage: {
      usedToday: 100,
      remainingToday: 0,
      minuteUsed: 0,
      minuteLimit: 10,
      dailyLimit: 100,
    },
    latestSuccessfulDailyAt: "2026-07-19T06:00:00.000Z",
    latestSuccessfulResultAt: "2026-07-19T11:00:00.000Z",
  });

  assert(warnings.some((warning) => warning.code === "quota_exhausted"), "quota warning");
  assert(
    warnings.some((warning) => warning.code === "fixtures_without_finished"),
    "finished fixture warning"
  );
  assert(
    warnings.some((warning) => warning.code === "pending_over_48h"),
    "pending over 48h warning"
  );
}

function testComputeNextRunFromHours(): void {
  const next = computeNextRunFromHours([9, 13, 17, 21], new Date("2026-07-19T10:00:00.000Z"));
  assert(next === "2026-07-19T13:00:00.000Z", "next run should be 13:00 UTC");
}

function runTests(): void {
  testBuildSchedulerExecutionMetrics();
  testWarningsForStaleJobs();
  testWarningsForQuotaAndFinishedFixtures();
  testComputeNextRunFromHours();
  console.log("schedulerStatusService.test.ts passed");
}

runTests();
