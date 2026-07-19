import type { AnalysisReport } from "@/lib/analysis/types";
import type { MatchTeamProfilesSnapshot } from "@/lib/teamProfile/teamProfileTypes";
import {
  buildGoogleSearchCacheKey,
  getCachedGoogleRecordAsync,
} from "@/lib/providers/googleSearch/googleSearchCache";
import { TEAM_CONTEXT_QUERY } from "@/lib/providers/googleSearch/googleSearchService";
import type { ReplayRawSources } from "@/lib/replay/replayTypes";

function serializeTeamProfilePayload(
  profile: MatchTeamProfilesSnapshot["home"]
): Record<string, unknown> | null {
  if (!profile) {
    return null;
  }

  return {
    teamId: profile.teamId,
    teamName: profile.teamName,
    leagueId: profile.leagueId,
    leagueName: profile.leagueName,
    season: profile.season,
    requestedSeason: profile.requestedSeason,
    isHistoricalBaseline: profile.isHistoricalBaseline,
    stalenessYears: profile.stalenessYears,
    sampleSize: profile.sampleSize,
    source: profile.source,
    dataCompleteness: profile.dataCompleteness,
    recent10AvgGoals: profile.recent10AvgGoals,
    recent10AvgConceded: profile.recent10AvgConceded,
    home5Matches: profile.home5Matches,
    away5Matches: profile.away5Matches,
    calculatedAt: profile.calculatedAt,
  };
}

export function buildApiFootballNormalizedPayload(
  teamProfiles: MatchTeamProfilesSnapshot | null | undefined
): Record<string, unknown> | null {
  if (!teamProfiles) {
    return null;
  }

  return {
    source: "api-football-normalized",
    completeness: teamProfiles.completeness,
    warnings: teamProfiles.warnings,
    home: serializeTeamProfilePayload(teamProfiles.home),
    away: serializeTeamProfilePayload(teamProfiles.away),
  };
}

export async function captureReplayRawSources(input: {
  report: AnalysisReport;
  matchDate?: string;
}): Promise<ReplayRawSources> {
  const cacheKey = buildGoogleSearchCacheKey({
    homeTeam: input.report.match.homeTeam,
    awayTeam: input.report.match.awayTeam,
    matchDate: input.matchDate,
    query: TEAM_CONTEXT_QUERY,
  });
  const googleRecord = await getCachedGoogleRecordAsync(cacheKey);
  const apiFootballRaw = buildApiFootballNormalizedPayload(input.report.teamProfiles);

  return {
    apiFootballRaw,
    googleGroundingRaw: googleRecord?.rawResponse ?? googleRecord?.payload ?? null,
    citations: googleRecord?.citations ?? googleRecord?.payload.citations ?? [],
    cacheSource: googleRecord ? "cache" : apiFootballRaw ? "api-football" : null,
  };
}
