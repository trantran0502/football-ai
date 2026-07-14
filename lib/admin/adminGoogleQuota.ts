const DAILY_SEARCH_LIMIT = 100;

interface GoogleQuotaWindow {
  dayKey: string;
  searchCount: number;
}

let quotaState: GoogleQuotaWindow = createWindow();

export function recordGoogleSearchRequest(now = Date.now()): void {
  refreshWindow(now);
  quotaState.searchCount += 1;
}

export function getGoogleQuotaSnapshot(now = Date.now()): {
  searchesToday: number;
  remainingToday: number | null;
  dailyLimit: number | null;
} {
  refreshWindow(now);
  return {
    searchesToday: quotaState.searchCount,
    remainingToday: Math.max(0, DAILY_SEARCH_LIMIT - quotaState.searchCount),
    dailyLimit: DAILY_SEARCH_LIMIT,
  };
}

export function resetGoogleQuotaForTests(): void {
  quotaState = createWindow();
}

function createWindow(now = Date.now()): GoogleQuotaWindow {
  return {
    dayKey: toDayKey(now),
    searchCount: 0,
  };
}

function refreshWindow(now: number): void {
  const dayKey = toDayKey(now);
  if (quotaState.dayKey !== dayKey) {
    quotaState = { dayKey, searchCount: 0 };
  }
}

function toDayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
