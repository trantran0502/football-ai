import type { SchedulerConfig } from "@/lib/scheduler/schedulerTypes";
import { parseLeagueIdWhitelist } from "@/lib/scheduler/leagueWhitelist";
import {
  DEFAULT_DAILY_ANALYSIS_HOURS_UTC,
  DEFAULT_RESULT_UPDATE_HOURS_UTC,
  parseUtcHoursEnv,
} from "@/lib/scheduler/cronSchedule";

export function getSchedulerConfig(): SchedulerConfig {
  const leagueIdWhitelist = parseLeagueIdWhitelist(
    process.env.SCHEDULER_LEAGUE_ID_WHITELIST?.trim()
  );

  const whitelistEnv = process.env.SCHEDULER_LEAGUE_WHITELIST?.trim();
  const leagueWhitelist = whitelistEnv
    ? whitelistEnv.split(",").map((item) => item.trim()).filter(Boolean)
    : [];

  return {
    leagueWhitelist,
    leagueIdWhitelist,
    dailyRunHoursUtc: parseUtcHoursEnv(
      process.env.SCHEDULER_DAILY_HOURS_UTC,
      DEFAULT_DAILY_ANALYSIS_HOURS_UTC
    ),
    resultRunHoursUtc: parseUtcHoursEnv(
      process.env.SCHEDULER_RESULT_HOURS_UTC,
      DEFAULT_RESULT_UPDATE_HOURS_UTC
    ),
    dailyRunHourUtc: Number(process.env.SCHEDULER_DAILY_HOUR_UTC ?? 0),
    resultRunHourUtc: Number(process.env.SCHEDULER_RESULT_HOUR_UTC ?? 15),
    lockTtlMs: Number(process.env.SCHEDULER_LOCK_TTL_MS ?? 30 * 60 * 1000),
    fixtureTimeoutMs: Number(process.env.SCHEDULER_FIXTURE_TIMEOUT_MS ?? 60_000),
    jobTimeoutMs: Number(process.env.SCHEDULER_JOB_TIMEOUT_MS ?? 15 * 60 * 1000),
    timeBudgetMs: readPositiveIntEnv("SCHEDULER_TIME_BUDGET_MS", 240_000),
    maxFixturesPerRun: readPositiveIntEnv("SCHEDULER_MAX_FIXTURES_PER_RUN", 3),
    maxTeamProfileRefreshesPerRun: readPositiveIntEnv(
      "SCHEDULER_MAX_TEAM_PROFILE_REFRESHS_PER_RUN",
      4
    ),
    maxRetries: Number(process.env.SCHEDULER_MAX_RETRIES ?? 3),
    retryDelayMs: Number(process.env.SCHEDULER_RETRY_DELAY_MS ?? 500),
  };
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function normalizeLeagueName(value: string): string {
  return value.trim().toLowerCase();
}

export function isLeagueAllowed(
  league: string,
  whitelist: string[]
): boolean {
  if (whitelist.length === 0) {
    return true;
  }
  const normalized = normalizeLeagueName(league);
  return whitelist.some(
    (item) =>
      normalized === normalizeLeagueName(item) ||
      normalized.includes(normalizeLeagueName(item))
  );
}
