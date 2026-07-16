import type { HistoricalBackfillCursor } from "@/lib/scheduler/historicalBackfillCursorStore";
import { compareDateKeys } from "@/lib/scheduler/historicalBackfillCursorStore";
import {
  defaultHistoricalBackfillStartDate,
  resolveHistoricalBackfillMinDate,
  type HistoricalBackfillConfig,
} from "@/lib/scheduler/historicalBackfillConfig";

export function maybeRestartCompletedHistoricalBackfillCursor(input: {
  cursor: HistoricalBackfillCursor;
  config: HistoricalBackfillConfig;
  now?: Date;
}): HistoricalBackfillCursor {
  const now = input.now ?? new Date();
  const yesterday = defaultHistoricalBackfillStartDate(now);

  if (input.cursor.status !== "completed") {
    return input.cursor;
  }

  if (compareDateKeys(input.cursor.currentDate, yesterday) >= 0) {
    return input.cursor;
  }

  return {
    ...input.cursor,
    currentDate: yesterday,
    minDate: resolveHistoricalBackfillMinDate(
      input.config,
      yesterday,
      input.cursor.planMinDate
    ),
    status: "in_progress",
    updatedAt: now.toISOString(),
  };
}

export function finalizeCompletedHistoricalBackfillCursor(input: {
  cursor: HistoricalBackfillCursor;
  now?: Date;
}): HistoricalBackfillCursor {
  const now = input.now ?? new Date();

  return {
    ...input.cursor,
    status: "completed",
    currentDate: defaultHistoricalBackfillStartDate(now),
    updatedAt: now.toISOString(),
  };
}
