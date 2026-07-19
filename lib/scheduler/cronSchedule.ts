export const DEFAULT_DAILY_ANALYSIS_HOURS_UTC = [0, 3, 6] as const;
export const DEFAULT_RESULT_UPDATE_HOURS_UTC = [9, 13, 17, 21] as const;
export const DEFAULT_DAILY_SUMMARY_HOUR_UTC = 22;
export const DEFAULT_HISTORICAL_BACKFILL_HOUR_UTC = 1;

export function parseUtcHoursEnv(
  raw: string | undefined,
  fallback: readonly number[]
): number[] {
  if (!raw?.trim()) {
    return [...fallback];
  }
  const parsed = raw
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 23);
  return parsed.length > 0 ? [...new Set(parsed)].sort((a, b) => a - b) : [...fallback];
}

export function computeNextRunFromHours(
  hoursUtc: readonly number[],
  from = new Date()
): string | null {
  if (hoursUtc.length === 0) {
    return null;
  }

  const candidates: Date[] = [];
  for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
    for (const hour of hoursUtc) {
      const candidate = new Date(from);
      candidate.setUTCDate(candidate.getUTCDate() + dayOffset);
      candidate.setUTCHours(hour, 0, 0, 0);
      if (candidate.getTime() > from.getTime()) {
        candidates.push(candidate);
      }
    }
  }

  candidates.sort((left, right) => left.getTime() - right.getTime());
  return candidates[0]?.toISOString() ?? null;
}

export function formatUtcHourList(hours: readonly number[]): string[] {
  return hours.map((hour) => `${String(hour).padStart(2, "0")}:00 UTC`);
}

export function buildVercelCronSchedule(hourUtc: number): string {
  return `0 ${hourUtc} * * *`;
}
