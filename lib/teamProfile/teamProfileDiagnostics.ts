import type {
  TeamProfileApiAttemptDiagnostic,
  TeamProfileFetchDiagnostics,
  TeamProfileTeamDiagnostic,
} from "@/lib/teamProfile/teamProfileTypes";

export function createEmptyFetchDiagnostics(
  input: {
    apiConfigured: boolean;
    quotaAvailable: boolean;
    quotaExhausted?: boolean;
    quotaBlockReason?: string | null;
  }
): TeamProfileFetchDiagnostics {
  return {
    apiConfigured: input.apiConfigured,
    quotaAvailableAtStart: input.quotaAvailable,
    quotaExhausted: input.quotaExhausted ?? !input.quotaAvailable,
    quotaBlockReason: input.quotaBlockReason ?? null,
    attempts: [],
    normalizedMatchCount: 0,
  };
}

export function buildTeamProfileTeamDiagnostic(input: {
  teamId: number;
  teamName: string;
  side: "home" | "away";
  matchLabel: string;
  fetchDiagnostics: TeamProfileFetchDiagnostics;
  skippedReason?: string;
  source?: string;
  sampleSize?: number;
  warnings: string[];
  quotaAvailable: boolean;
}): TeamProfileTeamDiagnostic {
  const lastAttempt = input.fetchDiagnostics.attempts.at(-1);
  const requestUrls = input.fetchDiagnostics.attempts.map((attempt) => attempt.requestUrl);

  return {
    teamId: input.teamId,
    teamName: input.teamName,
    side: input.side,
    matchLabel: input.matchLabel,
    requestUrls,
    requestUrl: lastAttempt?.requestUrl ?? null,
    rawResponseCount: lastAttempt?.rawResponseCount ?? 0,
    afterGoalFilterCount: lastAttempt?.afterGoalFilterCount ?? 0,
    normalizedMatchCount: input.fetchDiagnostics.normalizedMatchCount,
    skippedReason: input.skippedReason,
    quotaAvailable: input.quotaAvailable,
    apiConfigured: input.fetchDiagnostics.apiConfigured,
    quotaExhausted: input.fetchDiagnostics.quotaExhausted,
    quotaBlockReason: input.fetchDiagnostics.quotaBlockReason,
    source: input.source,
    sampleSize: input.sampleSize,
    warnings: input.warnings,
    attempts: input.fetchDiagnostics.attempts,
  };
}

export function summarizeTeamProfileDiagnostics(
  diagnostics: TeamProfileTeamDiagnostic[]
): string[] {
  const warnings: string[] = [];
  for (const entry of diagnostics) {
    const requestSummary =
      entry.requestUrls.length > 0
        ? entry.requestUrls.join(" | ")
        : entry.requestUrl ?? "none";
    warnings.push(
      `[${entry.side}] ${entry.teamName} (${entry.teamId}) ${entry.matchLabel}: skipped=${entry.skippedReason ?? "none"} apiConfigured=${entry.apiConfigured} quotaAvailable=${entry.quotaAvailable} quotaExhausted=${entry.quotaExhausted} raw=${entry.rawResponseCount} afterGoalFilter=${entry.afterGoalFilterCount} normalized=${entry.normalizedMatchCount} source=${entry.source ?? "unknown"} url=${requestSummary}`
    );
    warnings.push(...entry.warnings);
  }
  return warnings;
}

export function recordApiAttempt(
  diagnostics: TeamProfileFetchDiagnostics,
  attempt: TeamProfileApiAttemptDiagnostic
): void {
  diagnostics.attempts.push(attempt);
  diagnostics.normalizedMatchCount = Math.max(
    diagnostics.normalizedMatchCount,
    attempt.normalizedMatchCount
  );
}
