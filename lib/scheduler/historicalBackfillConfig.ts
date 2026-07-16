export interface HistoricalBackfillConfig {
  maxPerRun: number;
  minDate: string;
  startDate: string | null;
  freePlanLookbackDays: number;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readDateEnv(name: string): string | null {
  const raw = process.env[name]?.trim();
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return null;
  }
  return raw;
}

export function defaultHistoricalBackfillStartDate(now = new Date()): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function subtractDateKeys(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function maxDateKey(left: string, right: string): string {
  return left >= right ? left : right;
}

export function minDateKey(left: string, right: string): string {
  return left <= right ? left : right;
}

function defaultMinDate(startDate: string, lookbackDays: number): string {
  if (lookbackDays <= 0) {
    return startDate;
  }
  return subtractDateKeys(startDate, lookbackDays);
}

export function getHistoricalBackfillConfig(now = new Date()): HistoricalBackfillConfig {
  const freePlanLookbackDays = readPositiveIntEnv(
    "HISTORICAL_BACKFILL_FREE_PLAN_LOOKBACK_DAYS",
    2
  );
  const resolvedStartDate =
    readDateEnv("HISTORICAL_BACKFILL_START_DATE") ??
    defaultHistoricalBackfillStartDate(now);
  const envMinDate = readDateEnv("HISTORICAL_BACKFILL_MIN_DATE");
  const freePlanFloor = defaultMinDate(resolvedStartDate, freePlanLookbackDays);

  return {
    maxPerRun: readPositiveIntEnv("HISTORICAL_BACKFILL_MAX_PER_RUN", 100),
    minDate: envMinDate ? maxDateKey(envMinDate, freePlanFloor) : freePlanFloor,
    startDate: readDateEnv("HISTORICAL_BACKFILL_START_DATE"),
    freePlanLookbackDays,
  };
}

export function resolveHistoricalBackfillStartDate(
  config: HistoricalBackfillConfig,
  now = new Date()
): string {
  return config.startDate ?? defaultHistoricalBackfillStartDate(now);
}

export function resolveHistoricalBackfillMinDate(
  config: HistoricalBackfillConfig,
  startDate: string,
  planMinDate?: string | null
): string {
  const freePlanFloor = defaultMinDate(startDate, config.freePlanLookbackDays);
  let minDate = maxDateKey(config.minDate, freePlanFloor);
  if (planMinDate) {
    minDate = maxDateKey(minDate, planMinDate);
  }
  return minDate;
}
