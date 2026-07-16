export interface HistoricalBackfillConfig {
  maxPerRun: number;
  minDate: string;
  startDate: string | null;
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

function defaultStartDate(now = new Date()): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function defaultMinDate(now = new Date()): string {
  const date = new Date(now);
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return date.toISOString().slice(0, 10);
}

export function getHistoricalBackfillConfig(now = new Date()): HistoricalBackfillConfig {
  return {
    maxPerRun: readPositiveIntEnv("HISTORICAL_BACKFILL_MAX_PER_RUN", 100),
    minDate: readDateEnv("HISTORICAL_BACKFILL_MIN_DATE") ?? defaultMinDate(now),
    startDate: readDateEnv("HISTORICAL_BACKFILL_START_DATE"),
  };
}

export function resolveHistoricalBackfillStartDate(
  config: HistoricalBackfillConfig,
  now = new Date()
): string {
  return config.startDate ?? defaultStartDate(now);
}
