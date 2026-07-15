import type { ApiFootballTeamStatisticsRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import { getApiFootballClient } from "@/lib/providers/apiFootball/apiFootballClient";
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
        const form = await client.getTeamForm(identity.teamId, 15);
        const matches = normalizeApiFootballFixtures(form.fixtures);
        let advancedStats: TeamProfileAdvancedStatsInput | null = null;

        if (
          identity.leagueId !== null &&
          identity.season !== null &&
          canMakeApiFootballRequest()
        ) {
          const stats = await client.getTeamStatistics({
            teamId: identity.teamId,
            leagueId: identity.leagueId,
            season: identity.season,
          });
          advancedStats = mapSeasonStatistics(stats);
        }

        if (matches.length > 0) {
          return {
            matches,
            advancedStats,
            source: "api-football",
            warnings,
          };
        }
        warnings.push("API-Football returned no official completed matches.");
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
