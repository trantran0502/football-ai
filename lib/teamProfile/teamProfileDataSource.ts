import type { ApiFootballTeamStatisticsRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import {
  ApiFootballClient,
  getApiFootballClient,
  getApiFootballCurrentSeason,
} from "@/lib/providers/apiFootball/apiFootballClient";
import { canMakeApiFootballRequest } from "@/lib/providers/apiFootball/apiFootballQuota";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  normalizeApiFootballFixtures,
  normalizeVerifiedMatchRecords,
  sortMatchesDesc,
} from "@/lib/teamProfile/teamProfileNormalizer";
import type {
  TeamProfileAdvancedStatsInput,
  TeamProfileIdentity,
  TeamProfileMatchInput,
} from "@/lib/teamProfile/teamProfileTypes";

export interface TeamProfileDataFetchResult {
  matches: TeamProfileMatchInput[];
  advancedStats: TeamProfileAdvancedStatsInput | null;
  source: "api-football" | "match-records" | "incomplete";
  warnings: string[];
}

const TEAM_FORM_LAST = 15;

export async function fetchTeamProfileData(
  identity: TeamProfileIdentity,
  options: {
    allowApiFetch?: boolean;
    listVerifiedRecords?: () => Promise<HistoricalMatchRecord[]>;
  } = {}
): Promise<TeamProfileDataFetchResult> {
  const allowApiFetch = options.allowApiFetch ?? true;
  const warnings: string[] = [];

  if (allowApiFetch && canMakeApiFootballRequest()) {
    try {
      const client = getApiFootballClient();
      if (client.isConfigured()) {
        const matches = await fetchTeamFixturesFromApi(client, identity, warnings);
        const advancedStats = await fetchAdvancedStatsFromApi(client, identity, warnings);

        if (matches.length > 0) {
          return {
            matches,
            advancedStats,
            source: "api-football",
            warnings,
          };
        }
        warnings.push(
          "API-Football returned no official completed matches after all fetch strategies."
        );
      }
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? error.message
          : "API-Football team profile fetch failed."
      );
    }
  } else if (allowApiFetch) {
    warnings.push("API-Football quota exceeded; using fallback sources.");
  }

  const verifiedRecords = options.listVerifiedRecords
    ? await options.listVerifiedRecords()
    : await loadVerifiedRecordsFallback(identity.teamName);

  const verifiedMatches = normalizeVerifiedMatchRecords(
    verifiedRecords,
    identity.teamId,
    identity.teamName
  );

  if (verifiedMatches.length > 0) {
    return {
      matches: verifiedMatches,
      advancedStats: null,
      source: "match-records",
      warnings,
    };
  }

  warnings.push("Insufficient team history from API and verified match records.");
  return {
    matches: [],
    advancedStats: null,
    source: "incomplete",
    warnings,
  };
}

export function mergeTeamProfileMatches(
  primary: TeamProfileMatchInput[],
  fallback: TeamProfileMatchInput[]
): TeamProfileMatchInput[] {
  const merged = new Map<number, TeamProfileMatchInput>();
  for (const match of [...primary, ...fallback]) {
    merged.set(match.fixtureId, match);
  }
  return sortMatchesDesc([...merged.values()]);
}

async function fetchTeamFixturesFromApi(
  client: ApiFootballClient,
  identity: TeamProfileIdentity,
  warnings: string[]
): Promise<TeamProfileMatchInput[]> {
  const seasonCandidates = buildSeasonCandidates(identity.season);

  if (identity.leagueId !== null) {
    for (const season of seasonCandidates) {
      if (!canMakeApiFootballRequest()) {
        warnings.push("API-Football quota exceeded during league-scoped fixture fetch.");
        break;
      }

      const form = await client.getTeamForm(identity.teamId, TEAM_FORM_LAST, {
        leagueId: identity.leagueId,
        season,
        status: "FT",
      });
      appendFixtureAttemptWarning(
        warnings,
        form.meta,
        form.fixtures.length,
        identity.leagueId,
        season
      );

      const matches = normalizeApiFootballFixtures(form.fixtures);
      warnings.push(
        `Normalizer: ${matches.length} official completed matches (league=${identity.leagueId}, season=${season}).`
      );
      if (matches.length > 0) {
        return matches;
      }
    }
  }

  if (canMakeApiFootballRequest()) {
    const form = await client.getTeamForm(identity.teamId, TEAM_FORM_LAST, {
      status: "FT",
    });
    appendFixtureAttemptWarning(
      warnings,
      form.meta,
      form.fixtures.length,
      null,
      null
    );

    const matches = normalizeApiFootballFixtures(form.fixtures);
    warnings.push(`Normalizer: ${matches.length} official completed matches (global FT).`);
    if (matches.length > 0) {
      return matches;
    }
  }

  if (canMakeApiFootballRequest()) {
    const form = await client.getTeamForm(identity.teamId, TEAM_FORM_LAST);
    appendFixtureAttemptWarning(
      warnings,
      form.meta,
      form.fixtures.length,
      null,
      null
    );

    const matches = normalizeApiFootballFixtures(form.fixtures);
    warnings.push(`Normalizer: ${matches.length} official completed matches (global last).`);
    if (matches.length > 0) {
      return matches;
    }
  }

  return [];
}

async function fetchAdvancedStatsFromApi(
  client: ApiFootballClient,
  identity: TeamProfileIdentity,
  warnings: string[]
): Promise<TeamProfileAdvancedStatsInput | null> {
  if (identity.leagueId === null) {
    return null;
  }

  for (const season of buildSeasonCandidates(identity.season)) {
    if (!canMakeApiFootballRequest()) {
      warnings.push("API-Football quota exceeded during team statistics fetch.");
      break;
    }

    const stats = await client.getTeamStatistics({
      teamId: identity.teamId,
      leagueId: identity.leagueId,
      season,
    });
    const requestPath = `/teams/statistics?team=${identity.teamId}&league=${identity.leagueId}&season=${season}`;
    warnings.push(
      stats
        ? `API ${requestPath} returned season stats (fixturesPlayed=${stats.fixturesPlayed ?? 0}).`
        : `API ${requestPath} returned empty.`
    );

    if (stats && (stats.fixturesPlayed ?? 0) > 0) {
      return mapSeasonStatistics(stats);
    }
  }

  return null;
}

function buildSeasonCandidates(season: number | null): number[] {
  const candidates: number[] = [];
  const add = (value: number) => {
    if (!candidates.includes(value)) {
      candidates.push(value);
    }
  };

  if (season !== null) {
    add(season);
    add(season - 1);
  }
  add(getApiFootballCurrentSeason());
  return candidates;
}

function appendFixtureAttemptWarning(
  warnings: string[],
  meta: { requestPath: string; rawResponseCount: number } | undefined,
  afterGoalFilterCount: number,
  leagueId: number | null,
  season: number | null
): void {
  if (!meta) {
    return;
  }

  const scope =
    leagueId !== null && season !== null
      ? `league=${leagueId}, season=${season}`
      : "global";
  warnings.push(
    `API ${meta.requestPath} raw=${meta.rawResponseCount} afterGoalFilter=${afterGoalFilterCount} (${scope}).`
  );
}

function mapSeasonStatistics(
  stats: ApiFootballTeamStatisticsRecord | null
): TeamProfileAdvancedStatsInput | null {
  if (!stats) {
    return null;
  }

  return {
    avgShots: stats.shotsTotal,
    avgShotsOnTarget: stats.shotsOnTarget,
    avgPossession: null,
    avgXg: stats.expectedGoals,
    avgXga: stats.expectedGoalsAgainst,
  };
}

async function loadVerifiedRecordsFallback(
  teamName: string
): Promise<HistoricalMatchRecord[]> {
  try {
    if (typeof window !== "undefined") {
      return [];
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const { matchRecordRowToDomain } = await import("@/lib/supabase/mappers/matchRecordMapper");
    const supabase = getSupabaseAdmin();

    const [homeResult, awayResult] = await Promise.all([
      supabase
        .from("match_records")
        .select("*")
        .eq("status", "VERIFIED")
        .eq("home_team", teamName)
        .order("match_date", { ascending: false })
        .limit(20),
      supabase
        .from("match_records")
        .select("*")
        .eq("status", "VERIFIED")
        .eq("away_team", teamName)
        .order("match_date", { ascending: false })
        .limit(20),
    ]);

    const rows = [...(homeResult.data ?? []), ...(awayResult.data ?? [])];
    const deduped = new Map<string, HistoricalMatchRecord>();
    for (const row of rows) {
      const record = matchRecordRowToDomain(row);
      deduped.set(record.id, record);
    }

    return [...deduped.values()].sort((left, right) =>
      right.matchDate.localeCompare(left.matchDate)
    );
  } catch {
    return [];
  }
}
