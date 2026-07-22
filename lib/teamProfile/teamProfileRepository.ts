import type { SupabaseClient } from "@supabase/supabase-js";
import { logAdminError } from "@/lib/admin/adminErrorLog";
import { recordCacheHit, recordCacheMiss } from "@/lib/admin/adminCacheMetrics";
import {
  recordProfileCacheHit,
  recordProfileCacheMiss,
} from "@/lib/teamProfile/profileCacheMetrics";
import type {
  TeamProfile,
  TeamProfileIdentity,
} from "@/lib/teamProfile/teamProfileTypes";

const TABLE = "team_profiles";
const NULL_LEAGUE_ID = -1;
const NULL_SEASON = -1;

/** Logical upsert conflict target (migration 006 partial unique index). */
export const TEAM_PROFILE_UPSERT_CONFLICT_KEY = [
  "team_id",
  "league_id",
  "requested_season",
] as const;

let memoryProfiles = new Map<string, TeamProfile>();
let useMemoryStoreForTests = false;

export interface UpsertTeamProfileResult {
  profile: TeamProfile;
  persisted: boolean;
  error?: string;
  skippedOverwrite?: boolean;
}

/** Sources treated as a complete / usable persisted profile (not incomplete stubs). */
const COMPLETE_PROFILE_SOURCES = new Set<TeamProfile["source"]>([
  "api-football",
  "match-records",
  "provider-cache",
]);

export function isCompleteTeamProfile(profile: TeamProfile): boolean {
  return (
    COMPLETE_PROFILE_SOURCES.has(profile.source) && profile.sampleSize > 0
  );
}

/**
 * Incoming profiles that may replace an existing complete row.
 * Incomplete / sample=0 / refresh_failed / otherwise unusable must not overwrite.
 */
export function isIncomingTeamProfileAllowedToOverwrite(
  profile: TeamProfile
): boolean {
  if (!COMPLETE_PROFILE_SOURCES.has(profile.source)) {
    return false;
  }
  if (profile.sampleSize <= 0) {
    return false;
  }
  return true;
}

export function resolveTeamProfileOverwriteSkipReason(
  incoming: TeamProfile
): string {
  if (incoming.source === "incomplete") {
    return "source_incomplete";
  }
  if (incoming.source === "refresh_failed") {
    return "source_refresh_failed";
  }
  if (incoming.sampleSize <= 0) {
    return "sample_size_zero";
  }
  if (!COMPLETE_PROFILE_SOURCES.has(incoming.source)) {
    return "profile_unusable_source";
  }
  return "profile_unusable";
}

function logSkipProfileOverwriteExistingComplete(input: {
  teamId: number;
  season: number | null;
  existingSource: TeamProfile["source"];
  newSource: TeamProfile["source"];
  existingSample: number;
  newSample: number;
  reason: string;
}): void {
  logAdminError({
    category: "scheduler",
    message: "skip_profile_overwrite_existing_complete",
    context: {
      team_id: input.teamId,
      season: input.season,
      existing_source: input.existingSource,
      new_source: input.newSource,
      existing_sample: input.existingSample,
      new_sample: input.newSample,
      reason: input.reason,
    },
  });
}

export interface TeamProfilePersistencePlan {
  conflictKey: {
    team_id: number;
    league_id: number;
    requested_season: number;
  };
  insertPayload: Record<string, unknown>;
  updatePayload: Record<string, unknown>;
}

export function enableTeamProfileMemoryStoreForTests(): void {
  useMemoryStoreForTests = true;
  memoryProfiles = new Map();
}

export function disableTeamProfileMemoryStoreForTests(): void {
  useMemoryStoreForTests = false;
  memoryProfiles = new Map();
}

export function resetTeamProfileMemoryStoreForTests(): void {
  memoryProfiles = new Map();
}

export function listMemoryTeamProfilesForTests(): TeamProfile[] {
  return [...memoryProfiles.values()];
}

function profileKey(
  teamId: number,
  leagueId: number | null,
  requestedSeason: number | null
): string {
  return `${teamId}:${storageLeagueId(leagueId)}:requested:${storageSeason(requestedSeason)}`;
}

function storageLeagueId(leagueId: number | null): number {
  return leagueId ?? NULL_LEAGUE_ID;
}

function storageSeason(season: number | null): number {
  return season ?? NULL_SEASON;
}

function fromStorageLeagueId(leagueId: number): number | null {
  return leagueId === NULL_LEAGUE_ID ? null : leagueId;
}

function fromStorageSeason(season: number): number | null {
  return season === NULL_SEASON ? null : season;
}

function normalizeRequestedSeason(profile: TeamProfile): number | null {
  return profile.requestedSeason ?? profile.season;
}

function normalizeProfileForPersistence(profile: TeamProfile): TeamProfile {
  const requestedSeason = normalizeRequestedSeason(profile);
  return {
    ...profile,
    requestedSeason,
    isHistoricalBaseline: profile.isHistoricalBaseline ?? false,
    stalenessYears: profile.stalenessYears ?? null,
  };
}

function teamProfilesTable(supabase: SupabaseClient<unknown>): ReturnType<
  SupabaseClient<unknown>["from"]
> {
  return supabase.from(TABLE);
}

export function buildTeamProfilePersistencePlan(
  profile: TeamProfile,
  options?: { existingId?: string; now?: string }
): TeamProfilePersistencePlan {
  const normalized = normalizeProfileForPersistence(profile);
  const now = options?.now ?? new Date().toISOString();
  const requestedSeason = normalizeRequestedSeason(normalized);
  const updatePayload = buildTeamProfileUpdatePayload(normalized, now);
  const insertPayload = {
    id: options?.existingId ?? normalized.id ?? crypto.randomUUID(),
    ...updatePayload,
    created_at: normalized.createdAt ?? now,
  };

  return {
    conflictKey: {
      team_id: normalized.teamId,
      league_id: storageLeagueId(normalized.leagueId),
      requested_season: storageSeason(requestedSeason),
    },
    insertPayload,
    updatePayload,
  };
}

function buildTeamProfileUpdatePayload(
  profile: TeamProfile,
  updatedAt: string
): Record<string, unknown> {
  const requestedSeason = normalizeRequestedSeason(profile);

  return {
    team_id: profile.teamId,
    team_name: profile.teamName,
    league_id: storageLeagueId(profile.leagueId),
    league_name: profile.leagueName,
    season: storageSeason(profile.season),
    requested_season: storageSeason(requestedSeason),
    is_historical_baseline: profile.isHistoricalBaseline ?? false,
    staleness_years: profile.stalenessYears ?? null,
    sample_size: profile.sampleSize,
    recent10_wins: profile.recent10Wins,
    recent10_draws: profile.recent10Draws,
    recent10_losses: profile.recent10Losses,
    recent10_points_per_game: profile.recent10PointsPerGame,
    recent10_avg_goals: profile.recent10AvgGoals,
    recent10_avg_conceded: profile.recent10AvgConceded,
    home5_matches: profile.home5Matches,
    home5_win_rate: profile.home5WinRate,
    home5_avg_goals: profile.home5AvgGoals,
    home5_avg_conceded: profile.home5AvgConceded,
    away5_matches: profile.away5Matches,
    away5_win_rate: profile.away5WinRate,
    away5_avg_goals: profile.away5AvgGoals,
    away5_avg_conceded: profile.away5AvgConceded,
    btts_rate: profile.bttsRate,
    over25_rate: profile.over25Rate,
    over35_rate: profile.over35Rate,
    under25_rate: profile.under25Rate,
    clean_sheet_rate: profile.cleanSheetRate,
    failed_to_score_rate: profile.failedToScoreRate,
    avg_shots: profile.avgShots,
    avg_shots_on_target: profile.avgShotsOnTarget,
    avg_possession: profile.avgPossession,
    avg_xg: profile.avgXg,
    avg_xga: profile.avgXga,
    form_score: profile.formScore,
    momentum_score: profile.momentumScore,
    source: profile.source,
    data_completeness: profile.dataCompleteness,
    calculated_at: profile.calculatedAt,
    updated_at: updatedAt,
  };
}

export async function getTeamProfile(
  teamId: number,
  leagueId: number | null,
  requestedSeason: number | null
): Promise<TeamProfile | null> {
  if (useMemoryStoreForTests) {
    return memoryProfiles.get(profileKey(teamId, leagueId, requestedSeason)) ?? null;
  }

  try {
    if (typeof window !== "undefined") {
      return null;
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin() as SupabaseClient<unknown>;
    const requestedResult = await teamProfilesTable(supabase)
      .select("*")
      .eq("team_id", teamId)
      .eq("league_id", storageLeagueId(leagueId))
      .eq("requested_season", storageSeason(requestedSeason))
      .maybeSingle();

    if (requestedResult.data) {
      recordCacheHit();
      recordProfileCacheHit();
      return mapRowToProfile(requestedResult.data as Record<string, unknown>);
    }

    const legacyResult = await teamProfilesTable(supabase)
      .select("*")
      .eq("team_id", teamId)
      .eq("league_id", storageLeagueId(leagueId))
      .eq("season", storageSeason(requestedSeason))
      .is("requested_season", null)
      .maybeSingle();

    if (legacyResult.error || !legacyResult.data) {
      recordCacheMiss();
      recordProfileCacheMiss();
      return null;
    }

    recordCacheHit();
    recordProfileCacheHit();
    return mapRowToProfile(legacyResult.data as Record<string, unknown>);
  } catch {
    return null;
  }
}

async function listTeamLeagueProfileRows(
  supabase: SupabaseClient<unknown>,
  profile: TeamProfile
): Promise<Record<string, unknown>[]> {
  const result = await teamProfilesTable(supabase)
    .select("*")
    .eq("team_id", profile.teamId)
    .eq("league_id", storageLeagueId(profile.leagueId));

  if (result.error || !result.data) {
    return [];
  }

  return result.data as Record<string, unknown>[];
}

function pickCanonicalProfileRow(
  rows: Record<string, unknown>[],
  profile: TeamProfile
): Record<string, unknown> | null {
  if (rows.length === 0) {
    return null;
  }

  const requestedSeason = storageSeason(normalizeRequestedSeason(profile));
  const dataSeason = storageSeason(profile.season);

  const byRequested = rows.find(
    (row) => Number(row.requested_season) === requestedSeason
  );
  if (byRequested) {
    return byRequested;
  }

  const byLegacyRequested = rows.find(
    (row) =>
      row.requested_season === null &&
      Number(row.season) === requestedSeason
  );
  if (byLegacyRequested) {
    return byLegacyRequested;
  }

  const byDataSeason = rows.find((row) => Number(row.season) === dataSeason);
  if (byDataSeason) {
    return byDataSeason;
  }

  return null;
}

async function removeDuplicateProfileRows(
  supabase: SupabaseClient<unknown>,
  rows: Record<string, unknown>[],
  keepId: string
): Promise<void> {
  const duplicateIds = rows
    .map((row) => String(row.id))
    .filter((id) => id !== keepId);

  if (duplicateIds.length === 0) {
    return;
  }

  await teamProfilesTable(supabase).delete().in("id", duplicateIds);
}

async function removeSeasonKeyConflicts(
  supabase: SupabaseClient<unknown>,
  profile: TeamProfile,
  keepId?: string
): Promise<void> {
  let query = teamProfilesTable(supabase)
    .delete()
    .eq("team_id", profile.teamId)
    .eq("league_id", storageLeagueId(profile.leagueId))
    .eq("season", storageSeason(profile.season));

  if (keepId) {
    query = query.neq("id", keepId);
  }

  await query;
}

function shouldSkipOverwriteOfExistingComplete(
  existing: TeamProfile,
  incoming: TeamProfile
): { skip: boolean; reason?: string } {
  if (!isCompleteTeamProfile(existing)) {
    return { skip: false };
  }
  if (isIncomingTeamProfileAllowedToOverwrite(incoming)) {
    return { skip: false };
  }
  return {
    skip: true,
    reason: resolveTeamProfileOverwriteSkipReason(incoming),
  };
}

export async function upsertTeamProfile(
  profile: TeamProfile
): Promise<UpsertTeamProfileResult> {
  const normalized = normalizeProfileForPersistence(profile);
  const now = new Date().toISOString();

  if (useMemoryStoreForTests) {
    const key = profileKey(
      normalized.teamId,
      normalized.leagueId,
      normalized.requestedSeason
    );
    const existingMemory = memoryProfiles.get(key) ?? null;
    if (existingMemory) {
      const decision = shouldSkipOverwriteOfExistingComplete(
        existingMemory,
        normalized
      );
      if (decision.skip) {
        logSkipProfileOverwriteExistingComplete({
          teamId: normalized.teamId,
          season: normalized.season,
          existingSource: existingMemory.source,
          newSource: normalized.source,
          existingSample: existingMemory.sampleSize,
          newSample: normalized.sampleSize,
          reason: decision.reason ?? "profile_unusable",
        });
        return {
          profile: structuredClone(existingMemory),
          persisted: true,
          skippedOverwrite: true,
        };
      }
    }

    const stored: TeamProfile = {
      ...normalized,
      id: normalized.id ?? existingMemory?.id ?? crypto.randomUUID(),
      createdAt: normalized.createdAt ?? existingMemory?.createdAt ?? now,
      updatedAt: now,
    };
    memoryProfiles.set(key, structuredClone(stored));
    return { profile: stored, persisted: true };
  }

  try {
    if (typeof window !== "undefined") {
      return {
        profile: normalized,
        persisted: false,
        error: "Browser runtime cannot persist team profiles.",
      };
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin() as SupabaseClient<unknown>;
    const rows = await listTeamLeagueProfileRows(supabase, normalized);
    const existingRow = pickCanonicalProfileRow(rows, normalized);
    const existing = existingRow
      ? mapRowToProfile(existingRow)
      : null;
    const plan = buildTeamProfilePersistencePlan(normalized, {
      existingId: existing?.id ? String(existing.id) : undefined,
      now,
    });

    if (existing?.id) {
      const decision = shouldSkipOverwriteOfExistingComplete(
        existing,
        normalized
      );
      if (decision.skip) {
        logSkipProfileOverwriteExistingComplete({
          teamId: normalized.teamId,
          season: normalized.season,
          existingSource: existing.source,
          newSource: normalized.source,
          existingSample: existing.sampleSize,
          newSample: normalized.sampleSize,
          reason: decision.reason ?? "profile_unusable",
        });
        return {
          profile: existing,
          persisted: true,
          skippedOverwrite: true,
        };
      }

      const keepId = String(existing.id);
      await removeDuplicateProfileRows(supabase, rows, keepId);
      await removeSeasonKeyConflicts(supabase, normalized, keepId);

      const result = await teamProfilesTable(supabase)
        .update(plan.updatePayload)
        .eq("id", keepId)
        .select("*")
        .maybeSingle();

      if (result.error || !result.data) {
        const error =
          result.error?.message ?? "Team profile update returned no row.";
        logTeamProfilePersistError(normalized, error, "update", plan);
        return { profile: normalized, persisted: false, error };
      }

      return {
        profile: mapRowToProfile(result.data as Record<string, unknown>),
        persisted: true,
      };
    }

    await removeSeasonKeyConflicts(supabase, normalized);

    const result = await teamProfilesTable(supabase)
      .insert(plan.insertPayload)
      .select("*")
      .maybeSingle();

    if (result.error || !result.data) {
      const error =
        result.error?.message ?? "Team profile insert returned no row.";
      logTeamProfilePersistError(normalized, error, "insert", plan);
      return { profile: normalized, persisted: false, error };
    }

    return {
      profile: mapRowToProfile(result.data as Record<string, unknown>),
      persisted: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const plan = buildTeamProfilePersistencePlan(normalized, { now });
    logTeamProfilePersistError(normalized, message, "upsert", plan);
    return { profile: normalized, persisted: false, error: message };
  }
}

export async function listStaleTeamProfiles(
  staleBeforeIso: string
): Promise<TeamProfile[]> {
  if (useMemoryStoreForTests) {
    return [...memoryProfiles.values()].filter(
      (profile) => profile.calculatedAt < staleBeforeIso
    );
  }

  try {
    if (typeof window !== "undefined") {
      return [];
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin() as SupabaseClient<unknown>;
    const result = await teamProfilesTable(supabase)
      .select("*")
      .lt("calculated_at", staleBeforeIso)
      .order("calculated_at", { ascending: true })
      .limit(100);

    if (result.error || !result.data) {
      return [];
    }

    return (result.data as Record<string, unknown>[]).map(mapRowToProfile);
  } catch {
    return [];
  }
}

export async function markProfileRefreshFailure(
  identity: TeamProfileIdentity,
  warning: string
): Promise<UpsertTeamProfileResult> {
  const now = new Date().toISOString();
  const existing = await getTeamProfile(
    identity.teamId,
    identity.leagueId,
    identity.season
  );

  const profile: TeamProfile = existing ?? {
    teamId: identity.teamId,
    teamName: identity.teamName,
    leagueId: identity.leagueId,
    leagueName: identity.leagueName,
    season: identity.season,
    requestedSeason: identity.season,
    isHistoricalBaseline: false,
    stalenessYears: null,
    sampleSize: 0,
    recent10Wins: null,
    recent10Draws: null,
    recent10Losses: null,
    recent10PointsPerGame: null,
    recent10AvgGoals: null,
    recent10AvgConceded: null,
    home5Matches: null,
    home5WinRate: null,
    home5AvgGoals: null,
    home5AvgConceded: null,
    away5Matches: null,
    away5WinRate: null,
    away5AvgGoals: null,
    away5AvgConceded: null,
    bttsRate: null,
    over25Rate: null,
    over35Rate: null,
    under25Rate: null,
    cleanSheetRate: null,
    failedToScoreRate: null,
    avgShots: null,
    avgShotsOnTarget: null,
    avgPossession: null,
    avgXg: null,
    avgXga: null,
    formScore: null,
    momentumScore: null,
    source: "refresh_failed",
    dataCompleteness: 0,
    calculatedAt: now,
  };

  return upsertTeamProfile({
    ...profile,
    source: "refresh_failed",
    dataCompleteness: existing?.dataCompleteness ?? 0,
    calculatedAt: now,
    teamName: identity.teamName,
    leagueName: identity.leagueName,
  });
}

export async function getProfilesForMatch(input: {
  homeTeamId: number;
  awayTeamId: number;
  leagueId: number | null;
  season: number | null;
}): Promise<{ home: TeamProfile | null; away: TeamProfile | null }> {
  const [home, away] = await Promise.all([
    getTeamProfile(input.homeTeamId, input.leagueId, input.season),
    getTeamProfile(input.awayTeamId, input.leagueId, input.season),
  ]);
  return { home, away };
}

function logTeamProfilePersistError(
  profile: TeamProfile,
  error: string,
  operation: "insert" | "update" | "upsert",
  plan?: TeamProfilePersistencePlan
): void {
  logAdminError({
    category: "scheduler",
    message: `Team profile ${operation} failed`,
    context: {
      teamId: profile.teamId,
      teamName: profile.teamName,
      leagueId: profile.leagueId,
      season: profile.season,
      requestedSeason: profile.requestedSeason,
      isHistoricalBaseline: profile.isHistoricalBaseline,
      stalenessYears: profile.stalenessYears,
      source: profile.source,
      error,
      conflictKey: plan?.conflictKey,
      updatePayloadSeasonFields: plan
        ? {
            season: plan.updatePayload.season,
            requested_season: plan.updatePayload.requested_season,
            is_historical_baseline: plan.updatePayload.is_historical_baseline,
            staleness_years: plan.updatePayload.staleness_years,
          }
        : undefined,
    },
  });
}

function mapRowToProfile(row: Record<string, unknown>): TeamProfile {
  return {
    id: row.id as string,
    teamId: Number(row.team_id),
    teamName: String(row.team_name),
    leagueId: fromStorageLeagueId(Number(row.league_id)),
    leagueName: row.league_name === null ? null : String(row.league_name),
    season: fromStorageSeason(Number(row.season)),
    requestedSeason:
      row.requested_season === null || row.requested_season === undefined
        ? fromStorageSeason(Number(row.season))
        : fromStorageSeason(Number(row.requested_season)),
    isHistoricalBaseline: Boolean(row.is_historical_baseline),
    stalenessYears: nullableNumber(row.staleness_years),
    sampleSize: Number(row.sample_size ?? 0),
    recent10Wins: nullableNumber(row.recent10_wins),
    recent10Draws: nullableNumber(row.recent10_draws),
    recent10Losses: nullableNumber(row.recent10_losses),
    recent10PointsPerGame: nullableNumber(row.recent10_points_per_game),
    recent10AvgGoals: nullableNumber(row.recent10_avg_goals),
    recent10AvgConceded: nullableNumber(row.recent10_avg_conceded),
    home5Matches: nullableNumber(row.home5_matches),
    home5WinRate: nullableNumber(row.home5_win_rate),
    home5AvgGoals: nullableNumber(row.home5_avg_goals),
    home5AvgConceded: nullableNumber(row.home5_avg_conceded),
    away5Matches: nullableNumber(row.away5_matches),
    away5WinRate: nullableNumber(row.away5_win_rate),
    away5AvgGoals: nullableNumber(row.away5_avg_goals),
    away5AvgConceded: nullableNumber(row.away5_avg_conceded),
    bttsRate: nullableNumber(row.btts_rate),
    over25Rate: nullableNumber(row.over25_rate),
    over35Rate: nullableNumber(row.over35_rate),
    under25Rate: nullableNumber(row.under25_rate),
    cleanSheetRate: nullableNumber(row.clean_sheet_rate),
    failedToScoreRate: nullableNumber(row.failed_to_score_rate),
    avgShots: nullableNumber(row.avg_shots),
    avgShotsOnTarget: nullableNumber(row.avg_shots_on_target),
    avgPossession: nullableNumber(row.avg_possession),
    avgXg: nullableNumber(row.avg_xg),
    avgXga: nullableNumber(row.avg_xga),
    formScore: nullableNumber(row.form_score),
    momentumScore: nullableNumber(row.momentum_score),
    source: String(row.source) as TeamProfile["source"],
    dataCompleteness: Number(row.data_completeness ?? 0),
    calculatedAt: String(row.calculated_at),
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
