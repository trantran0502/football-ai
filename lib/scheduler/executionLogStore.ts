import type { ExecutionLogEntry, SchedulerJobName } from "@/lib/scheduler/schedulerTypes";

const logs: ExecutionLogEntry[] = [];
const runtimeState = {
  lastDailyRun: null as string | null,
  lastResultRun: null as string | null,
  lastSummaryRun: null as string | null,
};

export function startExecutionLog(input: {
  jobName: SchedulerJobName;
  runDate?: string | null;
  context?: Record<string, unknown> | null;
}): ExecutionLogEntry {
  const entry: ExecutionLogEntry = {
    id: crypto.randomUUID(),
    jobName: input.jobName,
    runDate: input.runDate ?? null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    success: false,
    errorMessage: null,
    context: input.context ?? null,
  };
  logs.unshift(entry);
  if (logs.length > 200) {
    logs.length = 200;
  }
  return entry;
}

export function finishExecutionLog(input: {
  id: string;
  success: boolean;
  errorMessage?: string | null;
  context?: Record<string, unknown> | null;
}): ExecutionLogEntry | null {
  const entry = logs.find((item) => item.id === input.id);
  if (!entry) {
    return null;
  }

  const finishedAt = new Date();
  entry.finishedAt = finishedAt.toISOString();
  entry.durationMs = finishedAt.getTime() - new Date(entry.startedAt).getTime();
  entry.success = input.success;
  entry.errorMessage = input.errorMessage ?? null;
  if (input.context) {
    entry.context = { ...(entry.context ?? {}), ...input.context };
  }

  if (input.success) {
    if (entry.jobName === "daily_analysis") {
      runtimeState.lastDailyRun = entry.finishedAt;
    } else if (entry.jobName === "result_update") {
      runtimeState.lastResultRun = entry.finishedAt;
    } else if (entry.jobName === "daily_summary") {
      runtimeState.lastSummaryRun = entry.finishedAt;
    }
  }

  void persistExecutionLog(entry);
  return entry;
}

export function listExecutionLogs(limit = 50): ExecutionLogEntry[] {
  return logs.slice(0, limit).map((entry) => structuredClone(entry));
}

export function getSchedulerRuntimeState() {
  return { ...runtimeState };
}

export function resetExecutionLogsForTests(): void {
  logs.length = 0;
  runtimeState.lastDailyRun = null;
  runtimeState.lastResultRun = null;
  runtimeState.lastSummaryRun = null;
}

async function persistExecutionLog(entry: ExecutionLogEntry): Promise<void> {
  try {
    if (typeof window !== "undefined") {
      return;
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    await supabase.from("execution_logs" as "match_records").insert({
      id: entry.id,
      job_name: entry.jobName,
      run_date: entry.runDate,
      started_at: entry.startedAt,
      finished_at: entry.finishedAt,
      duration_ms: entry.durationMs,
      success: entry.success,
      error_message: entry.errorMessage,
      context: entry.context,
    } as never);
  } catch {
    // Best-effort persistence.
  }
}
