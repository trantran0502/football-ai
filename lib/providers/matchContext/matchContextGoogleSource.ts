import type { MatchContextProviderRequest } from "@/lib/analysis/featureScore/providers/matchContextProvider";
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

export function resolveMatchContextFromGoogleSearch(input: {
  request: MatchContextProviderRequest;
  referenceDate?: string;
}): ProductionMatchContextResolution | null {
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
