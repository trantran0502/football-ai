import type { MatchContextProviderRequest } from "@/lib/analysis/featureScore/providers/matchContextProvider";
import {
  buildCombinedGroundingCacheKey,
  getCachedGoogleRecord,
} from "@/lib/providers/googleSearch/googleSearchCache";
import { parseGeminiStructuredJson } from "@/lib/providers/googleSearch/googleSearchMapper";
import type {
  GeminiFootballStructuredResponse,
  GeminiGenerateContentResponse,
  GoogleSearchCachedRecord,
} from "@/lib/providers/googleSearch/googleSearchTypes";
import { computeMatchContextProviderConfidence } from "@/lib/providers/matchContext/matchContextConfidence";
import {
  countOfficialCitations,
  hasOfficialCitation,
} from "@/lib/providers/matchContext/matchContextOfficialSource";
import {
  buildMatchContextSnapshotFromOfficialFields,
  countConfirmedMatchContextFields,
  extractOfficialMatchContextFields,
  resolveRestDaysForSnapshot,
} from "@/lib/providers/matchContext/matchContextNormalizer";
import {
  createEmptyMatchContextDiagnostics,
  type ProductionMatchContextResolution,
} from "@/lib/providers/matchContext/matchContextTypes";

function extractStructuredFromCachedRecord(
  record: GoogleSearchCachedRecord
): GeminiFootballStructuredResponse | null {
  const raw = record.rawResponse as
    | GeminiGenerateContentResponse
    | { normalizedAnswer?: string | null }
    | undefined;
  const text =
    (raw &&
      "candidates" in raw &&
      raw.candidates?.[0]?.content?.parts?.[0]?.text) ||
    (raw && "normalizedAnswer" in raw ? raw.normalizedAnswer : null);
  if (text) {
    try {
      return parseGeminiStructuredJson(text);
    } catch {
      return null;
    }
  }

  const payload = record.payload;
  if (!payload) {
    return null;
  }

  return {
    recentFormLast10Official: payload.recentFormLast10Official ?? [],
    recentFormLast5Home: payload.recentFormLast5Home ?? [],
    recentFormLast5Away: payload.recentFormLast5Away ?? [],
    includesFriendlies: payload.includesFriendlies ?? false,
    includesExtraTime: payload.includesExtraTime ?? false,
    includesPenalties: payload.includesPenalties ?? false,
    h2hLast5Official: payload.h2hLast5Official ?? [],
    standings: payload.standings ?? [],
    injuries: [],
    suspensions: [],
    matchStatus: payload.matchStatus
      ? {
          importance: payload.matchStatus.importance,
          mustWin: payload.matchStatus.mustWin,
          alreadyQualified: payload.matchStatus.alreadyQualified,
          alreadyEliminated: payload.matchStatus.alreadyEliminated,
          weather: payload.matchStatus.weather,
          longTravelAway: payload.matchStatus.longTravelAway,
          congestedSchedule: payload.matchStatus.congestedSchedule,
          coachNews: payload.matchStatus.coachNews,
          officialNews: payload.matchStatus.officialNews,
          rotation: payload.matchStatus.rotation,
        }
      : null,
    homeMetrics: payload.homeMetrics,
    awayMetrics: payload.awayMetrics,
  };
}

export function resolveMatchContextFromGoogleSearch(input: {
  request: MatchContextProviderRequest;
  referenceDate?: string;
  fixtureId?: number;
  kickoffTime?: string;
}): ProductionMatchContextResolution | null {
  const cacheKey = buildCombinedGroundingCacheKey({
    fixtureId: input.fixtureId,
    homeTeam: input.request.homeTeam,
    awayTeam: input.request.awayTeam,
    matchDate: input.request.matchDate,
    kickoffTime: input.kickoffTime,
  });
  const cached = getCachedGoogleRecord(cacheKey);
  if (!cached) {
    return null;
  }

  if (!hasOfficialCitation(cached.citations)) {
    return null;
  }

  const structured = extractStructuredFromCachedRecord(cached);
  if (!structured?.matchStatus) {
    return null;
  }

  const referenceDate =
    input.referenceDate ??
    input.request.matchDate ??
    new Date().toISOString().slice(0, 10);

  const fields = extractOfficialMatchContextFields({
    matchStatus: structured.matchStatus,
    homeTeam: input.request.homeTeam,
    awayTeam: input.request.awayTeam,
    recentFormRecords: structured.recentFormLast10Official ?? [],
    referenceDate,
  });

  const confirmedFieldCount = countConfirmedMatchContextFields(fields);
  if (confirmedFieldCount === 0) {
    return null;
  }

  const restDays = resolveRestDaysForSnapshot({
    homeTeam: input.request.homeTeam,
    awayTeam: input.request.awayTeam,
    recentFormRecords: structured.recentFormLast10Official ?? [],
    referenceDate,
  });

  const snapshot = buildMatchContextSnapshotFromOfficialFields({
    fields,
    homeRestDays: restDays.homeRestDays,
    awayRestDays: restDays.awayRestDays,
    referenceDate,
    sourceTimestamp: cached.searchTime,
  });

  const diagnostics = createEmptyMatchContextDiagnostics("googleSearch");
  diagnostics.sampleSize = snapshot.sampleSize ?? 0;
  diagnostics.dataFreshnessDays = snapshot.dataFreshnessDays ?? null;
  diagnostics.officialCitationCount = countOfficialCitations(cached.citations);
  diagnostics.confirmedFieldCount = confirmedFieldCount;

  return {
    snapshot,
    source: "googleSearch",
    confidence: computeMatchContextProviderConfidence({
      sampleSize: snapshot.sampleSize ?? 0,
      dataFreshnessDays: snapshot.dataFreshnessDays ?? null,
      source: "googleSearch",
    }),
    diagnostics,
  };
}
