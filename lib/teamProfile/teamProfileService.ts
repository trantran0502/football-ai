import { calculateTeamProfile } from "@/lib/teamProfile/teamProfileCalculator";
import {
  buildTeamProfileTeamDiagnostic,
  createEmptyFetchDiagnostics,
  summarizeTeamProfileDiagnostics,
} from "@/lib/teamProfile/teamProfileDiagnostics";
import { fetchTeamProfileData } from "@/lib/teamProfile/teamProfileDataSource";
import { getApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";
import {
  getProfilesForMatch,
  getTeamProfile,
  markProfileRefreshFailure,
  upsertTeamProfile,
} from "@/lib/teamProfile/teamProfileRepository";
import {
  canMakeApiFootballRequest,
  getApiFootballQuotaBlockReason,
} from "@/lib/providers/apiFootball/apiFootballQuota";
import type {
  EnsureTeamProfilesInput,
  EnsureTeamProfilesResult,
  MatchTeamProfilesSnapshot,
  RefreshTeamProfileInput,
  RefreshTeamProfileResult,
  TeamProfile,
  TeamProfileTeamDiagnostic,
} from "@/lib/teamProfile/teamProfileTypes";

const refreshedToday = new Map<string, string>();

export function getTeamProfileTtlHours(): number {
  const raw = process.env.TEAM_PROFILE_TTL_HOURS?.trim();
  const parsed = raw ? Number(raw) : 24;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
}

export function isTeamProfileStale(
  profile: TeamProfile,
  now = Date.now()
): boolean {
  const ttlMs = getTeamProfileTtlHours() * 60 * 60 * 1000;
  return now - new Date(profile.calculatedAt).getTime() >= ttlMs;
}

export function resetTeamProfileRefreshDedupeForTests(): void {
  refreshedToday.clear();
}

function dedupeKey(
  teamId: number,
  leagueId: number | null,
  season: number | null,
  runDate: string
): string {
  return `${teamId}:${leagueId ?? -1}:${season ?? -1}:${runDate}`;
}

function buildSkippedDiagnostic(input: {
  identity: RefreshTeamProfileInput;
  side: "home" | "away";
  matchLabel: string;
  skippedReason: string;
  profile?: TeamProfile | null;
  warnings?: string[];
}): TeamProfileTeamDiagnostic {
  return buildTeamProfileTeamDiagnostic({
    teamId: input.identity.teamId,
    teamName: input.identity.teamName,
    side: input.side,
    matchLabel: input.matchLabel,
    fetchDiagnostics: createEmptyFetchDiagnostics({
      apiConfigured: getApiFootballClient().isConfigured(),
      quotaAvailable: canMakeApiFootballRequest(),
      quotaBlockReason: getApiFootballQuotaBlockReason(),
    }),
    skippedReason: input.skippedReason,
    source: input.profile?.source,
    sampleSize: input.profile?.sampleSize,
    warnings: input.warnings ?? [`Profile refresh skipped: ${input.skippedReason}.`],
    quotaAvailable: canMakeApiFootballRequest(),
  });
}

export async function refreshTeamProfile(
  input: RefreshTeamProfileInput & {
    side?: "home" | "away";
    matchLabel?: string;
  }
): Promise<RefreshTeamProfileResult> {
  const runDate = input.runDate ?? new Date().toISOString().slice(0, 10);
  const side = input.side ?? "home";
  const matchLabel = input.matchLabel ?? input.teamName;
  const dedupe = dedupeKey(input.teamId, input.leagueId, input.season, runDate);

  if (refreshedToday.has(dedupe)) {
    const existing = await getTeamProfile(input.teamId, input.leagueId, input.season);
    if (existing && existing.sampleSize > 0) {
      return {
        profile: existing,
        completeness: existing.dataCompleteness,
        warnings: ["Profile refresh skipped due to same-day dedupe."],
        diagnostics: buildSkippedDiagnostic({
          identity: input,
          side,
          matchLabel,
          skippedReason: "same_day_dedupe",
          profile: existing,
        }),
        refreshed: false,
        skippedReason: "same_day_dedupe",
      };
    }
  }

  const existing = await getTeamProfile(input.teamId, input.leagueId, input.season);
  if (existing && !isTeamProfileStale(existing) && existing.sampleSize > 0) {
    return {
      profile: existing,
      completeness: existing.dataCompleteness,
      warnings: [],
      diagnostics: buildSkippedDiagnostic({
        identity: input,
        side,
        matchLabel,
        skippedReason: "fresh_profile",
        profile: existing,
        warnings: [],
      }),
      refreshed: false,
      skippedReason: "fresh_profile",
    };
  }

  try {
    const fetched = await fetchTeamProfileData(
      {
        teamId: input.teamId,
        teamName: input.teamName,
        leagueId: input.leagueId,
        leagueName: input.leagueName,
        season: input.season,
      },
      { allowApiFetch: input.allowApiFetch ?? true, waitForQuota: input.waitForQuota ?? true, maxQuotaWaitMs: input.maxQuotaWaitMs }
    );

    const profile = calculateTeamProfile({
      identity: {
        teamId: input.teamId,
        teamName: input.teamName,
        leagueId: input.leagueId,
        leagueName: input.leagueName,
        season: input.season,
      },
      matches: fetched.matches,
      advancedStats: fetched.advancedStats,
      source: fetched.source,
      seasonMetadata: fetched.seasonMetadata,
    });

    const saved = await upsertTeamProfile(profile);
    refreshedToday.set(dedupe, runDate);

    const warnings = [...fetched.warnings];
    let skippedReason: string | undefined;
    if (!saved.persisted) {
      skippedReason = "persist_failed";
      warnings.push(
        saved.error ?? `Team profile upsert failed for team ${input.teamId}.`
      );
    } else if (profile.sampleSize === 0 && fetched.seasonMetadata.fallbackReason === "plan_season_restricted") {
      skippedReason = "plan_season_restricted";
    } else if (profile.sampleSize === 0 && fetched.diagnostics.quotaExhausted) {
      skippedReason = "quota_exhausted";
      warnings.push("Team profile saved as incomplete due to API quota exhaustion.");
    } else if (profile.sampleSize === 0 && !fetched.diagnostics.apiConfigured) {
      skippedReason = "api_not_configured";
    } else if (profile.sampleSize === 0 && fetched.diagnostics.attempts.some((attempt) => attempt.rawResponseCount === 0)) {
      skippedReason = "api_raw_empty";
    } else if (profile.sampleSize === 0 && fetched.diagnostics.normalizedMatchCount === 0) {
      skippedReason = "normalized_empty";
    }

    return {
      profile: saved.profile,
      completeness: saved.profile.dataCompleteness,
      warnings,
      diagnostics: buildTeamProfileTeamDiagnostic({
        teamId: input.teamId,
        teamName: input.teamName,
        side,
        matchLabel,
        fetchDiagnostics: fetched.diagnostics,
        skippedReason,
        fallbackReason: fetched.seasonMetadata.fallbackReason ?? undefined,
        source: saved.profile.source,
        sampleSize: saved.profile.sampleSize,
        warnings,
        quotaAvailable: canMakeApiFootballRequest(),
      }),
      refreshed: saved.persisted,
      skippedReason,
    };
  } catch (error) {
    const warning =
      error instanceof Error ? error.message : "Team profile refresh failed.";
    if (existing) {
      refreshedToday.set(dedupe, runDate);
      return {
        profile: existing,
        completeness: existing.dataCompleteness,
        warnings: [warning],
        diagnostics: buildSkippedDiagnostic({
          identity: input,
          side,
          matchLabel,
          skippedReason: "refresh_failed_use_existing",
          profile: existing,
          warnings: [warning],
        }),
        refreshed: false,
        skippedReason: "refresh_failed_use_existing",
      };
    }

    const failed = await markProfileRefreshFailure(
      {
        teamId: input.teamId,
        teamName: input.teamName,
        leagueId: input.leagueId,
        leagueName: input.leagueName,
        season: input.season,
      },
      warning
    );
    refreshedToday.set(dedupe, runDate);
    const failureWarnings = [...(failed.error ? [failed.error] : [warning])];
    return {
      profile: failed.profile,
      completeness: failed.profile.dataCompleteness,
      warnings: failureWarnings,
      diagnostics: buildSkippedDiagnostic({
        identity: input,
        side,
        matchLabel,
        skippedReason: failed.persisted ? "refresh_failed" : "persist_failed",
        profile: failed.profile,
        warnings: failureWarnings,
      }),
      refreshed: failed.persisted,
      skippedReason: failed.persisted ? "refresh_failed" : "persist_failed",
    };
  }
}

export async function ensureTeamProfilesForMatch(
  input: EnsureTeamProfilesInput
): Promise<EnsureTeamProfilesResult> {
  const matchLabel = `${input.homeTeamName} vs ${input.awayTeamName}`;
  const profileDiagnostics: TeamProfileTeamDiagnostic[] = [];
  const deferred: Array<RefreshTeamProfileInput & { side: "home" | "away" }> = [];

  const homeResult = await refreshTeamProfile({
    teamId: input.homeTeamId,
    teamName: input.homeTeamName,
    leagueId: input.leagueId,
    leagueName: input.leagueName,
    season: input.season,
    runDate: input.runDate,
    allowApiFetch: input.allowApiFetch,
    side: "home",
    matchLabel,
  });
  profileDiagnostics.push(homeResult.diagnostics);
  if (homeResult.skippedReason === "quota_exhausted") {
    deferred.push({
      teamId: input.homeTeamId,
      teamName: input.homeTeamName,
      leagueId: input.leagueId,
      leagueName: input.leagueName,
      season: input.season,
      runDate: input.runDate,
      allowApiFetch: input.allowApiFetch,
      side: "home",
    });
  }

  const awayResult = await refreshTeamProfile({
    teamId: input.awayTeamId,
    teamName: input.awayTeamName,
    leagueId: input.leagueId,
    leagueName: input.leagueName,
    season: input.season,
    runDate: input.runDate,
    allowApiFetch: input.allowApiFetch,
    side: "away",
    matchLabel,
  });
  profileDiagnostics.push(awayResult.diagnostics);
  if (awayResult.skippedReason === "quota_exhausted") {
    deferred.push({
      teamId: input.awayTeamId,
      teamName: input.awayTeamName,
      leagueId: input.leagueId,
      leagueName: input.leagueName,
      season: input.season,
      runDate: input.runDate,
      allowApiFetch: input.allowApiFetch,
      side: "away",
    });
  }

  let finalHome = homeResult;
  let finalAway = awayResult;

  for (const item of deferred) {
    const retry = await refreshTeamProfile({
      ...item,
      matchLabel,
    });
    profileDiagnostics.push({
      ...retry.diagnostics,
      skippedReason: retry.skippedReason ?? "quota_deferred_retry",
      matchLabel,
    });
    if (item.side === "home") {
      finalHome = retry;
    } else {
      finalAway = retry;
    }
  }

  const profileWarnings = summarizeTeamProfileDiagnostics(profileDiagnostics);

  const snapshot = buildMatchTeamProfilesSnapshot(
    finalHome.profile,
    finalAway.profile,
    profileWarnings
  );

  return { snapshot, profileWarnings, profileDiagnostics };
}

export async function loadProfilesForMatch(input: {
  homeTeamId: number;
  awayTeamId: number;
  leagueId: number | null;
  season: number | null;
}): Promise<MatchTeamProfilesSnapshot> {
  const profiles = await getProfilesForMatch(input);
  return buildMatchTeamProfilesSnapshot(
    profiles.home,
    profiles.away,
    []
  );
}

export function buildMatchTeamProfilesSnapshot(
  home: TeamProfile | null,
  away: TeamProfile | null,
  warnings: string[]
): MatchTeamProfilesSnapshot {
  const completenessValues = [home?.dataCompleteness, away?.dataCompleteness].filter(
    (value): value is number => typeof value === "number"
  );
  const completeness =
    completenessValues.length > 0
      ? completenessValues.reduce((sum, value) => sum + value, 0) /
        completenessValues.length
      : 0;

  return {
    home,
    away,
    completeness: Math.round(completeness * 10) / 10,
    warnings,
  };
}

export function attachTeamProfilesToReport<T extends { teamProfiles?: MatchTeamProfilesSnapshot | null }>(
  report: T,
  snapshot: MatchTeamProfilesSnapshot
): T {
  return {
    ...report,
    teamProfiles: snapshot,
  };
}
