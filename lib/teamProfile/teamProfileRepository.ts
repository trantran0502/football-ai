import { logAdminError } from "@/lib/admin/adminErrorLog";
import type {
  TeamProfile,
  TeamProfileIdentity,
} from "@/lib/teamProfile/teamProfileTypes";

const TABLE = "team_profiles";
const NULL_LEAGUE_ID = -1;
const NULL_SEASON = -1;

let memoryProfiles = new Map<string, TeamProfile>();
let useMemoryStoreForTests = false;

export interface UpsertTeamProfileResult {
  profile: TeamProfile;
  persisted: boolean;
  error?: string;
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
    const supabase = getSupabaseAdmin();
    const requestedResult = await supabase
      .from(TABLE as "match_records")
      .select("*")
      .eq("team_id", teamId)
      .eq("league_id", storageLeagueId(leagueId))
      .eq("requested_season", storageSeason(requestedSeason))
      .maybeSingle();

    if (requestedResult.data) {
      return mapRowToProfile(requestedResult.data as Record<string, unknown>);
    }

    const legacyResult = await supabase
      .from(TABLE as "match_records")
      .select("*")
      .eq("team_id", teamId)
      .eq("league_id", storageLeagueId(leagueId))
      .eq("season", storageSeason(requestedSeason))
      .is("requested_season", null)
      .maybeSingle();

    if (legacyResult.error || !legacyResult.data) {
      return null;
    }

    return mapRowToProfile(legacyResult.data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function upsertTeamProfile(
  profile: TeamProfile
): Promise<UpsertTeamProfileResult> {
  const now = new Date().toISOString();

  if (useMemoryStoreForTests) {
    const stored: TeamProfile = {
      ...profile,
      id: profile.id ?? crypto.randomUUID(),
      createdAt: profile.createdAt ?? now,
      updatedAt: now,
    };
    memoryProfiles.set(
      profileKey(profile.teamId, profile.leagueId, profile.requestedSeason),
      structuredClone(stored)
    );
    return { profile: stored, persisted: true };
  }

  try {
    if (typeof window !== "undefined") {
      return {
        profile,
        persisted: false,
        error: "Browser runtime cannot persist team profiles.",
      };
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const supabase = getSupabaseAdmin();
    const existing = await getTeamProfile(
      profile.teamId,
      profile.leagueId,
      profile.requestedSeason
    );
    const row = mapProfileToRow({
      ...profile,
      id: existing?.id ?? profile.id ?? crypto.randomUUID(),
      createdAt: profile.createdAt ?? now,
      updatedAt: now,
    });

    if (existing?.id) {
      const result = await supabase
        .from(TABLE as "match_records")
        .update(row as never)
        .eq("id", existing.id)
        .select("*")
        .maybeSingle();
      if (result.error || !result.data) {
        const error = result.error?.message ?? "Team profile update returned no row.";
        logTeamProfilePersistError(profile, error, "update");
        return { profile, persisted: false, error };
      }
      return {
        profile: mapRowToProfile(result.data as Record<string, unknown>),
        persisted: true,
      };
    }

    const result = await supabase
      .from(TABLE as "match_records")
      .insert(row as never)
      .select("*")
      .maybeSingle();

    if (result.error || !result.data) {
      const error = result.error?.message ?? "Team profile insert returned no row.";
      logTeamProfilePersistError(profile, error, "insert");
      return { profile, persisted: false, error };
    }

    return {
      profile: mapRowToProfile(result.data as Record<string, unknown>),
      persisted: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logTeamProfilePersistError(profile, message, "upsert");
    return { profile, persisted: false, error: message };
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
    const supabase = getSupabaseAdmin();
    const result = await supabase
      .from(TABLE as "match_records")
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
  operation: "insert" | "update" | "upsert"
): void {
  logAdminError({
    category: "scheduler",
    message: `Team profile ${operation} failed`,
    context: {
      teamId: profile.teamId,
      teamName: profile.teamName,
      leagueId: profile.leagueId,
      season: profile.season,
      source: profile.source,
      error,
    },
  });
}

function mapProfileToRow(profile: TeamProfile): Record<string, unknown> {
  return {
    id: profile.id,
    team_id: profile.teamId,
    team_name: profile.teamName,
    league_id: storageLeagueId(profile.leagueId),
    league_name: profile.leagueName,
    season: storageSeason(profile.season),
    requested_season: storageSeason(profile.requestedSeason),
    is_historical_baseline: profile.isHistoricalBaseline,
    staleness_years: profile.stalenessYears,
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
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
  };
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
