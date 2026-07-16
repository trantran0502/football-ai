export interface HistoricalBackfillCursor {
  currentDate: string;
  minDate: string;
  status: "in_progress" | "completed";
  updatedAt: string;
}

const CURSOR_STATE_KEY = "historical_match_backfill_cursor";

let persistedCursorForTests: HistoricalBackfillCursor | null | undefined;

export function enableHistoricalBackfillCursorStoreForTests(): void {
  persistedCursorForTests = null;
}

export function disableHistoricalBackfillCursorStoreForTests(): void {
  persistedCursorForTests = undefined;
}

export function resetHistoricalBackfillCursorStoreForTests(): void {
  if (persistedCursorForTests !== undefined) {
    persistedCursorForTests = null;
  }
}

export function getHistoricalBackfillCursorForTests(): HistoricalBackfillCursor | null {
  return persistedCursorForTests ? structuredClone(persistedCursorForTests) : null;
}

export async function loadHistoricalBackfillCursor(): Promise<HistoricalBackfillCursor | null> {
  if (persistedCursorForTests !== undefined) {
    return persistedCursorForTests ? structuredClone(persistedCursorForTests) : null;
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
      .eq("state_key", CURSOR_STATE_KEY)
      .maybeSingle();

    if (result.error || !result.data) {
      return null;
    }

    const payload = (result.data as unknown as { payload: HistoricalBackfillCursor })
      .payload;
    if (!payload?.currentDate || !payload?.minDate) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function saveHistoricalBackfillCursor(
  cursor: HistoricalBackfillCursor
): Promise<void> {
  const payload: HistoricalBackfillCursor = {
    ...cursor,
    updatedAt: new Date().toISOString(),
  };

  if (persistedCursorForTests !== undefined) {
    persistedCursorForTests = structuredClone(payload);
    return;
  }

  try {
    if (typeof window !== "undefined") {
      return;
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    await supabase.from("scheduler_state" as "match_records").upsert({
      state_key: CURSOR_STATE_KEY,
      payload,
      updated_at: payload.updatedAt,
    } as never);
  } catch {
    // Best-effort — execution log still records cursor progress.
  }
}

export function createInitialHistoricalBackfillCursor(input: {
  startDate: string;
  minDate: string;
}): HistoricalBackfillCursor {
  return {
    currentDate: input.startDate,
    minDate: input.minDate,
    status: "in_progress",
    updatedAt: new Date().toISOString(),
  };
}

export function previousDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function compareDateKeys(left: string, right: string): number {
  return left.localeCompare(right);
}
