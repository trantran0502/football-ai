import { calculateTeamProfile } from "@/lib/teamProfile/teamProfileCalculator";
import { fetchTeamProfileData } from "@/lib/teamProfile/teamProfileDataSource";
import {
  getProfilesForMatch,
  getTeamProfile,
  markProfileRefreshFailure,
  upsertTeamProfile,
} from "@/lib/teamProfile/teamProfileRepository";
import type {
  EnsureTeamProfilesInput,
  EnsureTeamProfilesResult,
  MatchTeamProfilesSnapshot,
  RefreshTeamProfileInput,
  RefreshTeamProfileResult,
  TeamProfile,
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

export async function refreshTeamProfile(
  input: RefreshTeamProfileInput
): Promise<RefreshTeamProfileResult> {
  const runDate = input.runDate ?? new Date().toISOString().slice(0, 10);
  const dedupe = dedupeKey(input.teamId, input.leagueId, input.season, runDate);
  if (refreshedToday.has(dedupe)) {
    const existing = await getTeamProfile(input.teamId, input.leagueId, input.season);
    return {
      profile:
        existing ??
        buildIncompleteProfile(input, ["Profile refresh skipped due to same-day dedupe."]),
      completeness: existing?.dataCompleteness ?? 0,
      warnings: ["Profile refresh skipped due to same-day dedupe."],
      refreshed: false,
      skippedReason: "same_day_dedupe",
    };
  }

  const existing = await getTeamProfile(input.teamId, input.leagueId, input.season);
  if (existing && !isTeamProfileStale(existing)) {
    return {
      profile: existing,
      completeness: existing.dataCompleteness,
      warnings: [],
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
      { allowApiFetch: input.allowApiFetch ?? true }
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
    });

    const saved = await upsertTeamProfile(profile);
    refreshedToday.set(dedupe, runDate);

    const warnings = [...fetched.warnings];
    if (!saved.persisted) {
      warnings.push(
        saved.error ?? `Team profile upsert failed for team ${input.teamId}.`
      );
    }

    return {
      profile: saved.profile,
      completeness: saved.profile.dataCompleteness,
      warnings,
      refreshed: saved.persisted,
      skippedReason: saved.persisted ? undefined : "persist_failed",
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
    const failureWarnings = [...failed.error ? [failed.error] : [warning]];
    return {
      profile: failed.profile,
      completeness: failed.profile.dataCompleteness,
      warnings: failureWarnings,
      refreshed: failed.persisted,
      skippedReason: failed.persisted ? "refresh_failed" : "persist_failed",
    };
  }
}

export async function ensureTeamProfilesForMatch(
  input: EnsureTeamProfilesInput
): Promise<EnsureTeamProfilesResult> {
  const profileWarnings: string[] = [];

  const [homeResult, awayResult] = await Promise.all([
    refreshTeamProfile({
      teamId: input.homeTeamId,
      teamName: input.homeTeamName,
      leagueId: input.leagueId,
      leagueName: input.leagueName,
      season: input.season,
      runDate: input.runDate,
      allowApiFetch: input.allowApiFetch,
    }),
    refreshTeamProfile({
      teamId: input.awayTeamId,
      teamName: input.awayTeamName,
      leagueId: input.leagueId,
      leagueName: input.leagueName,
      season: input.season,
      runDate: input.runDate,
      allowApiFetch: input.allowApiFetch,
    }),
  ]);

  profileWarnings.push(...homeResult.warnings, ...awayResult.warnings);

  const snapshot = buildMatchTeamProfilesSnapshot(
    homeResult.profile,
    awayResult.profile,
    profileWarnings
  );

  return { snapshot, profileWarnings };
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

function buildIncompleteProfile(
  identity: RefreshTeamProfileInput,
  warnings: string[]
): TeamProfile {
  return calculateTeamProfile({
    identity,
    matches: [],
    advancedStats: null,
    source: warnings.length > 0 ? "incomplete" : "incomplete",
  });
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
