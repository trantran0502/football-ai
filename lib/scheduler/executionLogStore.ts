import type { ExecutionLogEntry, SchedulerJobName } from "@/lib/scheduler/schedulerTypes";

const logs: ExecutionLogEntry[] = [];
const runtimeState = {
  lastDailyRun: null as string | null,
  lastResultRun: null as string | null,
  lastSummaryRun: null as string | null,
};

const SCHEDULER_STATE_KEY = "last_run";

export interface ExecutionLogContext extends Record<string, unknown> {
  jobType: SchedulerJobName;
  status: "success" | "partial_success" | "failed" | "skipped";
  fixturesFetched?: number;
  analyzedCount?: number;
  skippedCount?: number;
  errorCount?: number;
  apiFootballRequestCount?: number;
  teamProfileApiRequestCount?: number;
  teamProfileWarnings?: string[];
  teamProfileDiagnostics?: unknown[];
  filterStats?: Record<string, unknown>;
  quotaSkipped?: boolean;
  pendingCount?: number;
  verifiedCount?: number;
  warning?: string;
  cacheHit?: boolean;
  fixtureSource?: string;
}

export interface CompleteExecutionLogResult {
  entry: ExecutionLogEntry | null;
  persisted: boolean;
  persistError?: string;
}

let persistedLogsForTests: ExecutionLogEntry[] | null = null;
let persistedSchedulerStateForTests: {
  lastDailyRun: string | null;
  lastResultRun: string | null;
  lastSummaryRun: string | null;
} | null = null;
let persistShouldFailForTests = false;

export function buildExecutionLogContext(
  input: ExecutionLogContext
): Record<string, unknown> {
  const context: Record<string, unknown> = { ...input };
  if (Array.isArray(input.teamProfileDiagnostics)) {
    context.teamProfileDiagnostics = input.teamProfileDiagnostics;
  }
  if (Array.isArray(input.teamProfileWarnings)) {
    context.teamProfileWarnings = input.teamProfileWarnings;
  }
  return context;
}

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
    updateRuntimeStateFromEntry(entry);
  }

  return entry;
}

export async function completeExecutionLog(input: {
  id: string;
  success: boolean;
  errorMessage?: string | null;
  context?: Record<string, unknown> | null;
}): Promise<CompleteExecutionLogResult> {
  const entry = finishExecutionLog(input);
  if (!entry) {
    return { entry: null, persisted: false, persistError: "Execution log entry not found." };
  }

  const persistResult = await persistExecutionLog(entry);
  if (input.success && persistResult.ok) {
    await persistSchedulerState(runtimeState);
  }

  return {
    entry,
    persisted: persistResult.ok,
    persistError: persistResult.error,
  };
}

export function listExecutionLogs(limit = 50): ExecutionLogEntry[] {
  return logs.slice(0, limit).map((entry) => structuredClone(entry));
}

export function getSchedulerRuntimeState() {
  return { ...runtimeState };
}

export async function loadRecentExecutionLogs(
  limit = 50
): Promise<ExecutionLogEntry[]> {
  const persisted = await loadPersistedExecutionLogs(Math.max(limit, 50));
  if (logs.length === 0) {
    return persisted.slice(0, limit);
  }

  const merged = new Map<string, ExecutionLogEntry>();
  for (const entry of [...logs, ...persisted]) {
    merged.set(entry.id, entry);
  }

  return [...merged.values()]
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, limit)
    .map((entry) => structuredClone(entry));
}

export async function loadSchedulerRuntimeState(): Promise<{
  lastDailyRun: string | null;
  lastResultRun: string | null;
  lastSummaryRun: string | null;
}> {
  const memory = getSchedulerRuntimeState();
  const fromState = await readSchedulerState();
  const fromLogs = deriveLastRunFromLogs(await loadPersistedExecutionLogs(100));

  return {
    lastDailyRun: pickLatestTimestamp(
      memory.lastDailyRun,
      fromState.lastDailyRun,
      fromLogs.lastDailyRun
    ),
    lastResultRun: pickLatestTimestamp(
      memory.lastResultRun,
      fromState.lastResultRun,
      fromLogs.lastResultRun
    ),
    lastSummaryRun: pickLatestTimestamp(
      memory.lastSummaryRun,
      fromState.lastSummaryRun,
      fromLogs.lastSummaryRun
    ),
  };
}

export async function aggregateApiFootballUsageForDate(
  runDate: string
): Promise<number | null> {
  const persistedLogs = await loadPersistedExecutionLogs(200);
  const dayLogs = persistedLogs.filter((entry) => entry.runDate === runDate);
  if (dayLogs.length === 0) {
    return null;
  }

  let total = 0;
  let hasCounts = false;
  for (const entry of dayLogs) {
    const count = entry.context?.apiFootballRequestCount;
    if (typeof count === "number" && Number.isFinite(count)) {
      total += count;
      hasCounts = true;
    }
  }

  return hasCounts ? total : null;
}

export function resetExecutionLogsForTests(): void {
  logs.length = 0;
  runtimeState.lastDailyRun = null;
  runtimeState.lastResultRun = null;
  runtimeState.lastSummaryRun = null;
}

export function enableExecutionLogPersistStoreForTests(): void {
  persistedLogsForTests = [];
  persistedSchedulerStateForTests = {
    lastDailyRun: null,
    lastResultRun: null,
    lastSummaryRun: null,
  };
}

export function disableExecutionLogPersistStoreForTests(): void {
  persistedLogsForTests = null;
  persistedSchedulerStateForTests = null;
  persistShouldFailForTests = false;
}

export function resetPersistedExecutionLogsForTests(): void {
  if (persistedLogsForTests) {
    persistedLogsForTests.length = 0;
  }
  if (persistedSchedulerStateForTests) {
    persistedSchedulerStateForTests.lastDailyRun = null;
    persistedSchedulerStateForTests.lastResultRun = null;
    persistedSchedulerStateForTests.lastSummaryRun = null;
  }
}

export function setExecutionLogPersistFailureForTests(fail: boolean): void {
  persistShouldFailForTests = fail;
}

function updateRuntimeStateFromEntry(entry: ExecutionLogEntry): void {
  if (entry.jobName === "daily_analysis") {
    runtimeState.lastDailyRun = entry.finishedAt;
  } else if (entry.jobName === "result_update") {
    runtimeState.lastResultRun = entry.finishedAt;
  } else if (entry.jobName === "daily_summary") {
    runtimeState.lastSummaryRun = entry.finishedAt;
  }

  if (persistedSchedulerStateForTests) {
    persistedSchedulerStateForTests.lastDailyRun = runtimeState.lastDailyRun;
    persistedSchedulerStateForTests.lastResultRun = runtimeState.lastResultRun;
    persistedSchedulerStateForTests.lastSummaryRun = runtimeState.lastSummaryRun;
  }
}

function deriveLastRunFromLogs(entries: ExecutionLogEntry[]): {
  lastDailyRun: string | null;
  lastResultRun: string | null;
  lastSummaryRun: string | null;
} {
  const findLatest = (jobName: SchedulerJobName): string | null => {
    const matches = entries.filter(
      (entry) => entry.jobName === jobName && entry.success && entry.finishedAt
    );
    if (matches.length === 0) {
      return null;
    }
    return matches
      .map((entry) => entry.finishedAt as string)
      .sort((left, right) => right.localeCompare(left))[0];
  };

  return {
    lastDailyRun: findLatest("daily_analysis"),
    lastResultRun: findLatest("result_update"),
    lastSummaryRun: findLatest("daily_summary"),
  };
}

function pickLatestTimestamp(...values: Array<string | null>): string | null {
  const valid = values.filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  if (valid.length === 0) {
    return null;
  }
  return valid.sort((left, right) => right.localeCompare(left))[0];
}

async function loadPersistedExecutionLogs(limit: number): Promise<ExecutionLogEntry[]> {
  if (persistedLogsForTests) {
    return persistedLogsForTests
      .slice()
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, limit)
      .map((entry) => structuredClone(entry));
  }

  try {
    if (typeof window !== "undefined") {
      return [];
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    const result = await supabase
      .from("execution_logs" as "match_records")
      .select(
        "id,job_name,run_date,started_at,finished_at,duration_ms,success,error_message,context"
      )
      .order("started_at", { ascending: false })
      .limit(limit);

    if (result.error || !result.data) {
      return [];
    }

    return (
      result.data as unknown as Array<{
        id: string;
        job_name: SchedulerJobName;
        run_date: string | null;
        started_at: string;
        finished_at: string | null;
        duration_ms: number | null;
        success: boolean;
        error_message: string | null;
        context: Record<string, unknown> | null;
      }>
    ).map((row) => ({
      id: row.id,
      jobName: row.job_name,
      runDate: row.run_date,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      durationMs: row.duration_ms,
      success: row.success,
      errorMessage: row.error_message,
      context: row.context,
    }));
  } catch {
    return [];
  }
}

async function readSchedulerState(): Promise<{
  lastDailyRun: string | null;
  lastResultRun: string | null;
  lastSummaryRun: string | null;
}> {
  if (persistedSchedulerStateForTests) {
    return { ...persistedSchedulerStateForTests };
  }

  try {
    if (typeof window !== "undefined") {
      return {
        lastDailyRun: null,
        lastResultRun: null,
        lastSummaryRun: null,
      };
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    const result = await supabase
      .from("scheduler_state" as "match_records")
      .select("payload")
      .eq("state_key", SCHEDULER_STATE_KEY)
      .maybeSingle();

    if (result.error || !result.data) {
      return {
        lastDailyRun: null,
        lastResultRun: null,
        lastSummaryRun: null,
      };
    }

    const payload = (result.data as unknown as { payload: Record<string, unknown> }).payload;
    return {
      lastDailyRun: typeof payload.daily === "string" ? payload.daily : null,
      lastResultRun: typeof payload.result === "string" ? payload.result : null,
      lastSummaryRun: typeof payload.summary === "string" ? payload.summary : null,
    };
  } catch {
    return {
      lastDailyRun: null,
      lastResultRun: null,
      lastSummaryRun: null,
    };
  }
}

async function persistSchedulerState(state: {
  lastDailyRun: string | null;
  lastResultRun: string | null;
  lastSummaryRun: string | null;
}): Promise<void> {
  if (persistedSchedulerStateForTests) {
    persistedSchedulerStateForTests.lastDailyRun = state.lastDailyRun;
    persistedSchedulerStateForTests.lastResultRun = state.lastResultRun;
    persistedSchedulerStateForTests.lastSummaryRun = state.lastSummaryRun;
    return;
  }

  try {
    if (typeof window !== "undefined") {
      return;
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    await supabase.from("scheduler_state" as "match_records").upsert({
      state_key: SCHEDULER_STATE_KEY,
      payload: {
        daily: state.lastDailyRun,
        result: state.lastResultRun,
        summary: state.lastSummaryRun,
      },
      updated_at: new Date().toISOString(),
    } as never);
  } catch {
    // Best-effort — execution_logs remain the source of truth.
  }
}

async function persistExecutionLog(
  entry: ExecutionLogEntry
): Promise<{ ok: boolean; error?: string }> {
  if (persistShouldFailForTests) {
    return { ok: false, error: "Simulated execution log persist failure." };
  }

  if (persistedLogsForTests) {
    const existingIndex = persistedLogsForTests.findIndex((item) => item.id === entry.id);
    const cloned = structuredClone(entry);
    if (existingIndex >= 0) {
      persistedLogsForTests[existingIndex] = cloned;
    } else {
      persistedLogsForTests.unshift(cloned);
    }
    return { ok: true };
  }

  try {
    if (typeof window !== "undefined") {
      return { ok: false, error: "Browser runtime cannot persist execution logs." };
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    const result = await supabase.from("execution_logs" as "match_records").insert({
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

    if (result.error) {
      return { ok: false, error: result.error.message };
    }

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}
