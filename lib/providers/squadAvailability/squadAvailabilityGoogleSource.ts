import type { SquadAvailabilityProviderRequest } from "@/lib/analysis/featureScore/providers/squadAvailabilityProvider";
import {
  buildGoogleSearchCacheKey,
  getCachedGoogleRecord,
} from "@/lib/providers/googleSearch/googleSearchCache";
import { parseGeminiStructuredJson } from "@/lib/providers/googleSearch/googleSearchMapper";
import { TEAM_CONTEXT_QUERY } from "@/lib/providers/googleSearch/googleSearchService";
import type {
  GeminiFootballStructuredResponse,
  GeminiGenerateContentResponse,
  GoogleSearchCachedRecord,
} from "@/lib/providers/googleSearch/googleSearchTypes";
import { computeSquadAvailabilityProviderConfidence } from "@/lib/providers/squadAvailability/squadAvailabilityConfidence";
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
  const raw = record.rawResponse as GeminiGenerateContentResponse | undefined;
  const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return null;
  }

  try {
    return parseGeminiStructuredJson(text);
  } catch {
    return null;
  }
}

export function resolveSquadAvailabilityFromGoogleSearch(input: {
  request: SquadAvailabilityProviderRequest;
  referenceDate?: string;
}): ProductionSquadAvailabilityResolution | null {
  const cacheKey = buildGoogleSearchCacheKey({
    homeTeam: input.request.homeTeam,
    awayTeam: input.request.awayTeam,
    matchDate: input.request.matchDate,
    query: TEAM_CONTEXT_QUERY,
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
