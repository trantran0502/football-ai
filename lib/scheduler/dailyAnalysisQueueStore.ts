export interface DailyAnalysisQueueState {
  runDate: string;
  fixtureIds: number[];
  cursor: number;
  completedFixtureIds: number[];
  failedFixtureIds: number[];
  deferredFixtureIds: number[];
  deferredTeamProfileKeys: string[];
  terminalDeferredFixtureIds?: number[];
  status: "in_progress" | "completed";
  updatedAt: string;
}

export interface DailyAnalysisBatchProgress {
  totalEligible: number;
  processedThisRun: number;
  remaining: number;
  cursorBefore: number;
  cursorAfter: number;
  deferredFixtures: number[];
  deferredTeamProfiles: string[];
  timeBudgetReached: boolean;
  executionDurationMs: number;
}

function queueStateKey(runDate: string): string {
  return `daily_analysis_queue:${runDate}`;
}

let persistedQueuesForTests: Map<string, DailyAnalysisQueueState> | null = null;

export function enableDailyAnalysisQueueStoreForTests(): void {
  persistedQueuesForTests = new Map();
}

export function disableDailyAnalysisQueueStoreForTests(): void {
  persistedQueuesForTests = null;
}

export function resetDailyAnalysisQueueStoreForTests(): void {
  persistedQueuesForTests?.clear();
}

export function listDailyAnalysisQueuesForTests(): DailyAnalysisQueueState[] {
  return persistedQueuesForTests
    ? [...persistedQueuesForTests.values()].map((entry) => structuredClone(entry))
    : [];
}

export function mergeQueueWithEligibleFixtures(
  existing: DailyAnalysisQueueState | null,
  runDate: string,
  eligibleFixtureIds: number[]
): DailyAnalysisQueueState {
  const now = new Date().toISOString();

  if (!existing || existing.runDate !== runDate) {
    return {
      runDate,
      fixtureIds: [...eligibleFixtureIds],
      cursor: 0,
      completedFixtureIds: [],
      failedFixtureIds: [],
      deferredFixtureIds: [],
      deferredTeamProfileKeys: [],
      status: eligibleFixtureIds.length === 0 ? "completed" : "in_progress",
      updatedAt: now,
    };
  }

  const mergedFixtureIds = [
    ...new Set([...existing.fixtureIds, ...eligibleFixtureIds]),
  ];

  return {
    ...existing,
    fixtureIds: mergedFixtureIds,
    completedFixtureIds: existing.completedFixtureIds.filter((fixtureId) =>
      mergedFixtureIds.includes(fixtureId)
    ),
    failedFixtureIds: existing.failedFixtureIds.filter((fixtureId) =>
      mergedFixtureIds.includes(fixtureId)
    ),
    deferredFixtureIds: existing.deferredFixtureIds.filter((fixtureId) =>
      mergedFixtureIds.includes(fixtureId)
    ),
    status:
      countRemaining({
        ...existing,
        fixtureIds: mergedFixtureIds,
      }) === 0
        ? "completed"
        : "in_progress",
    updatedAt: now,
  };
}

export function countRemaining(queue: DailyAnalysisQueueState): number {
  const completed = new Set(queue.completedFixtureIds);
  const failed = new Set(queue.failedFixtureIds);
  return queue.fixtureIds.filter(
    (fixtureId) => !completed.has(fixtureId) && !failed.has(fixtureId)
  ).length;
}

export function isQueueCompleted(queue: DailyAnalysisQueueState): boolean {
  return countRemaining(queue) === 0;
}

export async function loadDailyAnalysisQueue(
  runDate: string
): Promise<DailyAnalysisQueueState | null> {
  if (persistedQueuesForTests) {
    return (
      persistedQueuesForTests.get(queueStateKey(runDate)) ??
      null
    );
  }

  try {
    if (typeof window !== "undefined") {
      return null;
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    const result = await supabase
      .from("scheduler_state" as "match_records")
      .select("payload")
      .eq("state_key", queueStateKey(runDate))
      .maybeSingle();

    if (result.error || !result.data) {
      return null;
    }

    const payload = (result.data as unknown as { payload: DailyAnalysisQueueState })
      .payload;
    return payload?.runDate === runDate ? payload : null;
  } catch {
    return null;
  }
}

export async function saveDailyAnalysisQueue(
  queue: DailyAnalysisQueueState
): Promise<void> {
  const payload: DailyAnalysisQueueState = {
    ...queue,
    updatedAt: new Date().toISOString(),
    status: isQueueCompleted(queue) ? "completed" : "in_progress",
  };

  if (persistedQueuesForTests) {
    persistedQueuesForTests.set(queueStateKey(queue.runDate), structuredClone(payload));
    return;
  }

  try {
    if (typeof window !== "undefined") {
      return;
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    await supabase.from("scheduler_state" as "match_records").upsert({
      state_key: queueStateKey(queue.runDate),
      payload,
      updated_at: payload.updatedAt,
    } as never);
  } catch {
    // Best-effort — execution log still records batch progress.
  }
}

export async function clearDailyAnalysisQueue(runDate: string): Promise<void> {
  if (persistedQueuesForTests) {
    persistedQueuesForTests.delete(queueStateKey(runDate));
    return;
  }

  try {
    if (typeof window !== "undefined") {
      return;
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    await supabase
      .from("scheduler_state" as "match_records")
      .delete()
      .eq("state_key", queueStateKey(runDate));
  } catch {
    // Best-effort cleanup.
  }
}
