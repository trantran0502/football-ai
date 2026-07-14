import type { HybridCitation, HybridSourcePayload } from "@/lib/hybrid/hybridTypes";
import type {
  GeminiFootballMatchRecord,
  GeminiFootballStructuredResponse,
  GeminiGroundingMetadata,
  GoogleSearchLiveResult,
  GoogleSearchMatchRequest,
} from "@/lib/providers/googleSearch/googleSearchTypes";

function mapMatch(record: GeminiFootballMatchRecord) {
  return {
    matchDate: record.matchDate,
    homeTeam: record.homeTeam,
    awayTeam: record.awayTeam,
    homeGoals: record.homeGoals,
    awayGoals: record.awayGoals,
    competition: record.competition,
    competitionType: record.competitionType,
    venue: record.venue,
    neutralVenue: record.neutralVenue,
    includesExtraTime: record.includesExtraTime,
    includesPenalties: record.includesPenalties,
  };
}

function mapMetrics(
  metrics: GeminiFootballStructuredResponse["homeMetrics"]
): HybridSourcePayload["homeMetrics"] {
  if (!metrics) {
    return null;
  }
  return {
    goalsFor: metrics.goalsFor,
    goalsAgainst: metrics.goalsAgainst,
    xg: metrics.xg,
    xga: metrics.xga,
    shots: metrics.shots,
    shotsOnTarget: metrics.shotsOnTarget,
    possession: metrics.possession,
    cleanSheets: metrics.cleanSheets,
    failedToScore: metrics.failedToScore,
  };
}

function extractCitationsFromGrounding(
  metadata: GeminiGroundingMetadata | undefined,
  structured: GeminiFootballStructuredResponse
): HybridCitation[] {
  const citations: HybridCitation[] = [];
  const seen = new Set<string>();

  for (const chunk of metadata?.groundingChunks ?? []) {
    const url = chunk.web?.uri;
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    citations.push({
      url,
      title: chunk.web?.title,
    });
  }

  const addSourceUrl = (url?: string) => {
    if (!url || seen.has(url)) {
      return;
    }
    seen.add(url);
    citations.push({ url });
  };

  for (const record of structured.recentFormLast10Official) {
    addSourceUrl(record.sourceUrl);
  }
  for (const record of structured.h2hLast5Official) {
    addSourceUrl(record.sourceUrl);
  }
  for (const row of structured.standings) {
    addSourceUrl(row.sourceUrl);
  }
  for (const injury of [...structured.injuries, ...structured.suspensions]) {
    addSourceUrl(injury.sourceUrl);
  }

  return citations;
}

function calculateConfidence(
  structured: GeminiFootballStructuredResponse,
  citationCount: number
): number {
  let score = 0.35;
  if (structured.recentFormLast10Official.length > 0) {
    score += 0.12;
  }
  if (structured.recentFormLast5Home.length > 0) {
    score += 0.05;
  }
  if (structured.recentFormLast5Away.length > 0) {
    score += 0.05;
  }
  if (structured.h2hLast5Official.length > 0) {
    score += 0.08;
  }
  if (structured.standings.length > 0) {
    score += 0.05;
  }
  if (structured.injuries.length > 0 || structured.suspensions.length > 0) {
    score += 0.05;
  }
  if (structured.matchStatus?.weather) {
    score += 0.03;
  }
  if (structured.matchStatus?.coachNews || structured.matchStatus?.officialNews) {
    score += 0.04;
  }
  score += Math.min(0.18, citationCount * 0.03);
  return Math.min(0.95, Math.round(score * 1000) / 1000);
}

export function mapGeminiStructuredToHybridPayload(
  request: GoogleSearchMatchRequest,
  structured: GeminiFootballStructuredResponse,
  metadata: GeminiGroundingMetadata | undefined,
  searchTime: string,
  query: string,
  rawResponse: unknown
): GoogleSearchLiveResult {
  const citations = extractCitationsFromGrounding(metadata, structured);
  const confidence = calculateConfidence(structured, citations.length);

  const payload: HybridSourcePayload = {
    source: "googleSearch",
    fetchedAt: searchTime,
    confidence,
    citations,
    queries: [query, ...(metadata?.webSearchQueries ?? [])],
    homeTeam: request.homeTeam,
    awayTeam: request.awayTeam,
    matchDate: request.matchDate,
    recentFormLast10Official: structured.recentFormLast10Official.map(mapMatch),
    recentFormLast5Home: structured.recentFormLast5Home.map(mapMatch),
    recentFormLast5Away: structured.recentFormLast5Away.map(mapMatch),
    includesFriendlies: structured.includesFriendlies,
    includesExtraTime: structured.includesExtraTime,
    includesPenalties: structured.includesPenalties,
    h2hLast5Official: structured.h2hLast5Official.map(mapMatch),
    standings: structured.standings.map((row) => ({
      teamName: row.teamName,
      rank: row.rank,
      played: row.played,
      points: row.points,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
    })),
    injuries: structured.injuries.map((item) => ({
      teamName: item.teamName,
      playerName: item.playerName,
      reason: item.reason,
      status: item.status,
    })),
    suspensions: structured.suspensions.map((item) => ({
      teamName: item.teamName,
      playerName: item.playerName,
      reason: item.reason,
      status: item.status,
    })),
    homeMetrics: mapMetrics(structured.homeMetrics),
    awayMetrics: mapMetrics(structured.awayMetrics),
    matchStatus: structured.matchStatus
      ? {
          importance: structured.matchStatus.importance,
          mustWin: structured.matchStatus.mustWin,
          alreadyQualified: structured.matchStatus.alreadyQualified,
          alreadyEliminated: structured.matchStatus.alreadyEliminated,
          weather: structured.matchStatus.weather,
          longTravelAway: structured.matchStatus.longTravelAway,
          congestedSchedule: structured.matchStatus.congestedSchedule,
          coachNews: structured.matchStatus.coachNews,
          officialNews: structured.matchStatus.officialNews,
          rotation: structured.matchStatus.rotation,
        }
      : null,
  };

  return {
    payload,
    citations,
    confidence,
    searchTime,
    query,
    rawResponse,
  };
}

export function parseGeminiStructuredJson(text: string): GeminiFootballStructuredResponse {
  const parsed = JSON.parse(text) as GeminiFootballStructuredResponse;
  return {
    recentFormLast10Official: parsed.recentFormLast10Official ?? [],
    recentFormLast5Home: parsed.recentFormLast5Home ?? [],
    recentFormLast5Away: parsed.recentFormLast5Away ?? [],
    includesFriendlies: parsed.includesFriendlies ?? false,
    includesExtraTime: parsed.includesExtraTime ?? false,
    includesPenalties: parsed.includesPenalties ?? false,
    h2hLast5Official: parsed.h2hLast5Official ?? [],
    standings: parsed.standings ?? [],
    homeMetrics: parsed.homeMetrics ?? null,
    awayMetrics: parsed.awayMetrics ?? null,
    injuries: parsed.injuries ?? [],
    suspensions: parsed.suspensions ?? [],
    matchStatus: parsed.matchStatus ?? null,
  };
}
