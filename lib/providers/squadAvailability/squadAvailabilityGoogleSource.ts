import type { SquadAvailabilityProviderRequest } from "@/lib/analysis/featureScore/providers/squadAvailabilityProvider";
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
import { computeSquadAvailabilityProviderConfidence } from "@/lib/providers/squadAvailability/squadAvailabilityConfidence";
import {
  isOfficialAnnouncementUrl,
} from "@/lib/providers/squadAvailability/squadAvailabilityOfficialSource";
import {
  buildSquadAvailabilitySnapshotFromOfficialRecords,
  normalizeOfficialGooglePlayerRecords,
} from "@/lib/providers/squadAvailability/squadAvailabilityNormalizer";
import {
  createEmptySquadAvailabilityDiagnostics,
  type ProductionSquadAvailabilityResolution,
} from "@/lib/providers/squadAvailability/squadAvailabilityTypes";

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

  const fallbackSourceUrl =
    record.citations.find((citation) => isOfficialAnnouncementUrl(citation.url))?.url ??
    record.citations[0]?.url ??
    "";
  return {
    recentFormLast10Official: payload.recentFormLast10Official ?? [],
    recentFormLast5Home: payload.recentFormLast5Home ?? [],
    recentFormLast5Away: payload.recentFormLast5Away ?? [],
    includesFriendlies: payload.includesFriendlies ?? false,
    includesExtraTime: payload.includesExtraTime ?? false,
    includesPenalties: payload.includesPenalties ?? false,
    h2hLast5Official: payload.h2hLast5Official ?? [],
    standings: payload.standings ?? [],
    injuries: (payload.injuries ?? []).map((item) => ({
      teamName: item.teamName,
      playerName: item.playerName,
      reason: item.reason,
      status: item.status,
      sourceUrl: fallbackSourceUrl,
    })),
    suspensions: (payload.suspensions ?? []).map((item) => ({
      teamName: item.teamName,
      playerName: item.playerName,
      reason: item.reason,
      status: item.status,
      sourceUrl: fallbackSourceUrl,
    })),
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

export function resolveSquadAvailabilityFromGoogleSearch(input: {
  request: SquadAvailabilityProviderRequest;
  referenceDate?: string;
  fixtureId?: number;
  kickoffTime?: string;
}): ProductionSquadAvailabilityResolution | null {
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

  const structured = extractStructuredFromCachedRecord(cached);
  if (!structured) {
    return null;
  }

  const { records, stats } = normalizeOfficialGooglePlayerRecords({
    injuries: structured.injuries,
    suspensions: structured.suspensions,
  });

  if (records.length === 0) {
    return null;
  }

  const referenceDate =
    input.referenceDate ??
    input.request.matchDate ??
    new Date().toISOString().slice(0, 10);

  const snapshot = buildSquadAvailabilitySnapshotFromOfficialRecords({
    homeTeam: input.request.homeTeam,
    awayTeam: input.request.awayTeam,
    records,
    referenceDate,
    sourceTimestamp: cached.searchTime,
    stats,
  });

  const diagnostics = createEmptySquadAvailabilityDiagnostics("googleSearch");
  diagnostics.sampleSize = snapshot.sampleSize ?? 0;
  diagnostics.dataFreshnessDays = snapshot.dataFreshnessDays ?? null;
  diagnostics.officialRecordCount = stats.officialRecordCount;
  diagnostics.filteredUnofficialCount = stats.filteredUnofficialCount;
  diagnostics.filteredUnconfirmedCount = stats.filteredUnconfirmedCount;

  return {
    snapshot,
    source: "googleSearch",
    confidence: computeSquadAvailabilityProviderConfidence({
      sampleSize: snapshot.sampleSize ?? 0,
      dataFreshnessDays: snapshot.dataFreshnessDays ?? null,
      source: "googleSearch",
    }),
    diagnostics,
  };
}
