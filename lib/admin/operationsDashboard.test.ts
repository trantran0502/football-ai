import { summarizeSchedulerExecutions } from "@/lib/admin/operationsDashboardService";
import type { ExecutionLogEntry } from "@/lib/scheduler/schedulerTypes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testSchedulerExecutionSummary(): void {
  const entries: ExecutionLogEntry[] = [
    {
      id: "1",
      jobName: "daily_analysis",
      runDate: "2026-07-18",
      startedAt: "2026-07-18T00:05:00.000Z",
      finishedAt: "2026-07-18T00:06:00.000Z",
      durationMs: 60000,
      success: true,
      errorMessage: null,
      context: { fixturesFetched: 12 },
    },
    {
      id: "2",
      jobName: "result_update",
      runDate: "2026-07-18",
      startedAt: "2026-07-18T15:05:00.000Z",
      finishedAt: "2026-07-18T15:06:00.000Z",
      durationMs: 60000,
      success: false,
      errorMessage: "failed",
      context: null,
    },
  ];

  const summary = summarizeSchedulerExecutions("2026-07-18", entries);
  assert(summary.fixturesFetchedToday === 12, "fixtures fetched today");
  assert(summary.successCount === 1, "success count");
  assert(summary.failureCount === 1, "failure count");
  assert(summary.dataCompleteness.inserted === 0, "default completeness inserted");
}

export function runOperationsDashboardTests(): void {
  testSchedulerExecutionSummary();
}

void (() => {
  runOperationsDashboardTests();
  console.log("Operations dashboard tests passed.");
})();
