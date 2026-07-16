const DAILY_LIMIT = 100;
const MINUTE_LIMIT = 10;

interface QuotaWindow {
  dayKey: string;
  minuteKey: string;
  dailyCount: number;
  minuteCount: number;
}

let quotaState: QuotaWindow = createWindow();

export function canMakeApiFootballRequest(now = Date.now()): boolean {
  refreshWindow(now);
  return (
    quotaState.dailyCount < DAILY_LIMIT && quotaState.minuteCount < MINUTE_LIMIT
  );
}

export function getApiFootballQuotaBlockReason(
  now = Date.now()
): "minute_limit" | "daily_limit" | null {
  refreshWindow(now);
  if (quotaState.dailyCount >= DAILY_LIMIT) {
    return "daily_limit";
  }
  if (quotaState.minuteCount >= MINUTE_LIMIT) {
    return "minute_limit";
  }
  return null;
}

export async function waitForApiFootballQuota(
  options: { maxWaitMs?: number; intervalMs?: number } = {}
): Promise<{ available: boolean; waitedMs: number }> {
  const maxWaitMs = options.maxWaitMs ?? 65_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const startedAt = Date.now();

  if (canMakeApiFootballRequest(startedAt)) {
    return { available: true, waitedMs: 0 };
  }

  while (Date.now() - startedAt < maxWaitMs) {
    await sleep(intervalMs);
    if (canMakeApiFootballRequest()) {
      return { available: true, waitedMs: Date.now() - startedAt };
    }
  }

  return { available: false, waitedMs: Date.now() - startedAt };
}

export function recordApiFootballRequest(now = Date.now()): void {
  refreshWindow(now);
  quotaState.dailyCount += 1;
  quotaState.minuteCount += 1;
}

export function getApiFootballQuotaSnapshot(now = Date.now()): {
  dailyCount: number;
  minuteCount: number;
  dailyLimit: number;
  minuteLimit: number;
  canRequest: boolean;
} {
  refreshWindow(now);
  return {
    dailyCount: quotaState.dailyCount,
    minuteCount: quotaState.minuteCount,
    dailyLimit: DAILY_LIMIT,
    minuteLimit: MINUTE_LIMIT,
    canRequest: canMakeApiFootballRequest(now),
  };
}

export function resetApiFootballQuotaForTests(): void {
  quotaState = createWindow();
}

export function setApiFootballQuotaForTests(input: {
  dailyCount?: number;
  minuteCount?: number;
}): void {
  refreshWindow(Date.now());
  quotaState.dailyCount = input.dailyCount ?? quotaState.dailyCount;
  quotaState.minuteCount = input.minuteCount ?? quotaState.minuteCount;
}

function createWindow(now = Date.now()): QuotaWindow {
  return {
    dayKey: toDayKey(now),
    minuteKey: toMinuteKey(now),
    dailyCount: 0,
    minuteCount: 0,
  };
}

function refreshWindow(now: number): void {
  const dayKey = toDayKey(now);
  const minuteKey = toMinuteKey(now);
  if (quotaState.dayKey !== dayKey) {
    quotaState.dayKey = dayKey;
    quotaState.dailyCount = 0;
  }
  if (quotaState.minuteKey !== minuteKey) {
    quotaState.minuteKey = minuteKey;
    quotaState.minuteCount = 0;
  }
}

function toDayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function toMinuteKey(now: number): string {
  const date = new Date(now);
  return `${date.toISOString().slice(0, 16)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
