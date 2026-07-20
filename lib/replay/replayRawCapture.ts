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

function buildGoogleGroundingNormalized(
  googleRecord: Awaited<ReturnType<typeof getCachedGoogleRecordAsync>>
): ReplayRawSources["googleGroundingNormalized"] {
  if (!googleRecord) {
    return null;
  }

  const captureSource =
    googleRecord.rawResponse &&
    typeof googleRecord.rawResponse === "object" &&
    (googleRecord.rawResponse as { captureSource?: string }).captureSource === "live"
      ? "live"
      : "cache";

  return {
    source: "google-grounding",
    captureSource,
    query: googleRecord.query,
    model:
      typeof googleRecord.rawResponse === "object" &&
      googleRecord.rawResponse &&
      typeof (googleRecord.rawResponse as { model?: unknown }).model === "string"
        ? (googleRecord.rawResponse as { model: string }).model
        : null,
    capturedAt: googleRecord.searchTime,
    confidence: googleRecord.confidence,
    citations: googleRecord.citations,
    normalizedAnswer:
      typeof googleRecord.rawResponse === "object" &&
      googleRecord.rawResponse &&
      typeof (googleRecord.rawResponse as { normalizedAnswer?: unknown }).normalizedAnswer ===
        "string"
        ? (googleRecord.rawResponse as { normalizedAnswer: string }).normalizedAnswer
        : null,
    groundingChunks:
      typeof googleRecord.rawResponse === "object" &&
      googleRecord.rawResponse &&
      Array.isArray((googleRecord.rawResponse as { groundingChunks?: unknown }).groundingChunks)
        ? ((googleRecord.rawResponse as { groundingChunks: unknown[] }).groundingChunks)
        : [],
    groundingSupports:
      typeof googleRecord.rawResponse === "object" &&
      googleRecord.rawResponse &&
      Array.isArray((googleRecord.rawResponse as { groundingSupports?: unknown }).groundingSupports)
        ? ((googleRecord.rawResponse as { groundingSupports: unknown[] }).groundingSupports)
        : [],
    payload: googleRecord.payload,
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
  const googleGroundingNormalized = buildGoogleGroundingNormalized(googleRecord);

  return {
    apiFootballRaw,
    googleGroundingRaw:
      googleRecord?.rawResponse ??
      googleGroundingNormalized ??
      googleRecord?.payload ??
      null,
    googleGroundingNormalized,
    citations: googleRecord?.citations ?? googleRecord?.payload.citations ?? [],
    cacheSource: googleRecord ? "google" : apiFootballRaw ? "api-football" : null,
  };
}
