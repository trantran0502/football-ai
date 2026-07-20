import { getGoogleSearchProvider } from "@/lib/providers/googleSearch/googleSearchProvider";
import { getApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";
import type { ExecutionLogEntry } from "@/lib/scheduler/schedulerTypes";

export type ProviderHealthState =
  | "HEALTHY"
  | "DEGRADED"
  | "NOT_CONFIGURED"
  | "UNKNOWN";

export interface ProviderHealthStatus {
  provider: string;
  state: ProviderHealthState;
  configured: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastFailureReason: string | null;
}

const MS_PER_HOUR = 60 * 60 * 1000;
const RECENT_RUN_WINDOW_MS = 24 * MS_PER_HOUR;

function readContextBoolean(
  context: Record<string, unknown> | null | undefined,
  key: string
): boolean | null {
  const value = context?.[key];
  return typeof value === "boolean" ? value : null;
}

function readContextNumber(
  context: Record<string, unknown> | null | undefined,
  key: string
): number | null {
  const value = context?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function findLatestExecution(
  entries: ExecutionLogEntry[],
  jobName: ExecutionLogEntry["jobName"]
): ExecutionLogEntry | null {
  return entries.find((entry) => entry.jobName === jobName) ?? null;
}

function resolveConfiguredRecentHealth(input: {
  provider: string;
  configured: boolean;
  latestEntry: ExecutionLogEntry | null;
  recentSuccess: boolean;
  recentFailureReason: string | null;
}): ProviderHealthStatus {
  if (!input.configured) {
    return {
      provider: input.provider,
      state: "NOT_CONFIGURED",
      configured: false,
      lastRunAt: input.latestEntry?.startedAt ?? null,
      lastSuccessAt: input.recentSuccess ? input.latestEntry?.finishedAt ?? null : null,
      lastFailureReason: "not_configured",
    };
  }

  if (!input.latestEntry) {
    return {
      provider: input.provider,
      state: "UNKNOWN",
      configured: true,
      lastRunAt: null,
      lastSuccessAt: null,
      lastFailureReason: null,
    };
  }

  const recent =
    input.latestEntry.startedAt &&
    Date.now() - Date.parse(input.latestEntry.startedAt) <= RECENT_RUN_WINDOW_MS;

  if (!recent) {
    return {
      provider: input.provider,
      state: "UNKNOWN",
      configured: true,
      lastRunAt: input.latestEntry.startedAt,
      lastSuccessAt: input.recentSuccess ? input.latestEntry.finishedAt : null,
      lastFailureReason: input.recentFailureReason,
    };
  }

  if (input.recentSuccess) {
    return {
      provider: input.provider,
      state: "HEALTHY",
      configured: true,
      lastRunAt: input.latestEntry.startedAt,
      lastSuccessAt: input.latestEntry.finishedAt,
      lastFailureReason: null,
    };
  }

  return {
    provider: input.provider,
    state: "DEGRADED",
    configured: true,
    lastRunAt: input.latestEntry.startedAt,
    lastSuccessAt: null,
    lastFailureReason: input.recentFailureReason,
  };
}

export function resolveProviderHealthStatuses(
  executionLogs: ExecutionLogEntry[],
  now = new Date()
): ProviderHealthStatus[] {
  void now;
  const daily = findLatestExecution(executionLogs, "daily_analysis");
  const resultUpdate = findLatestExecution(executionLogs, "result_update");
  const backfill = findLatestExecution(executionLogs, "historical_match_backfill");
  const dailyContext = daily?.context ?? null;

  const apiConfigured = getApiFootballClient().isConfigured();
  const googleConfigured = getGoogleSearchProvider().isConfigured();
  const dailySuccess =
    daily?.success === true &&
    (dailyContext?.status === "success" || dailyContext?.status === "partial_success");
  const resultSuccess = resultUpdate?.success === true;
  const backfillSuccess = backfill?.success === true;

  const groundingConfigured = readContextBoolean(dailyContext, "groundingConfigured");
  const groundingSucceeded = readContextNumber(dailyContext, "groundingSucceeded") ?? 0;
  const groundingCalled = readContextNumber(dailyContext, "groundingCalled") ?? 0;
  const groundingFailureReason =
    typeof dailyContext?.groundingFailureReason === "string"
      ? dailyContext.groundingFailureReason
      : null;

  return [
    resolveConfiguredRecentHealth({
      provider: "API-Football",
      configured: apiConfigured,
      latestEntry: daily,
      recentSuccess: dailySuccess === true,
      recentFailureReason: daily?.errorMessage ?? null,
    }),
    resolveConfiguredRecentHealth({
      provider: "Google Search",
      configured: googleConfigured || groundingConfigured === true,
      latestEntry: daily,
      recentSuccess:
        googleConfigured &&
        (groundingSucceeded > 0 || groundingCalled === 0) &&
        groundingFailureReason !== "not_configured",
      recentFailureReason:
        groundingFailureReason ??
        (googleConfigured ? daily?.errorMessage ?? null : "not_configured"),
    }),
    resolveConfiguredRecentHealth({
      provider: "Scheduler",
      configured: true,
      latestEntry: daily,
      recentSuccess: dailySuccess === true,
      recentFailureReason: daily?.errorMessage ?? null,
    }),
    resolveConfiguredRecentHealth({
      provider: "Replay",
      configured: true,
      latestEntry: daily,
      recentSuccess:
        (readContextNumber(dailyContext, "snapshotPersistedCount") ?? 0) > 0 ||
        dailySuccess === true,
      recentFailureReason:
        (readContextNumber(dailyContext, "snapshotMissingCount") ?? 0) > 0
          ? "snapshot_missing"
          : daily?.errorMessage ?? null,
    }),
    resolveConfiguredRecentHealth({
      provider: "Result Update",
      configured: apiConfigured,
      latestEntry: resultUpdate,
      recentSuccess: resultSuccess,
      recentFailureReason: resultUpdate?.errorMessage ?? null,
    }),
    resolveConfiguredRecentHealth({
      provider: "Historical Backfill",
      configured: apiConfigured,
      latestEntry: backfill,
      recentSuccess: backfillSuccess,
      recentFailureReason: backfill?.errorMessage ?? null,
    }),
  ];
}
