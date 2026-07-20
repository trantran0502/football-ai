import type { HybridCitation } from "@/lib/hybrid/hybridTypes";
import type { HybridSourcePayload } from "@/lib/hybrid/hybridTypes";

export type GoogleCacheCategory =
  | "news"
  | "injuries"
  | "weather"
  | "recentForm"
  | "h2h";

export const GOOGLE_CACHE_TTL_MS: Record<GoogleCacheCategory, number> = {
  news: 2 * 60 * 60 * 1000,
  injuries: 2 * 60 * 60 * 1000,
  weather: 3 * 60 * 60 * 1000,
  recentForm: 12 * 60 * 60 * 1000,
  h2h: 24 * 60 * 60 * 1000,
};

export interface GoogleSearchMatchRequest {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
  leagueName?: string;
}

export interface GoogleSearchLiveResult {
  payload: HybridSourcePayload;
  citations: HybridCitation[];
  confidence: number;
  searchTime: string;
  query: string;
  rawResponse: unknown;
  model?: string;
}

export interface GoogleSearchCachedRecord {
  payload: HybridSourcePayload;
  citations: HybridCitation[];
  confidence: number;
  searchTime: string;
  query: string;
  rawResponse: unknown;
  categoryExpiresAt: Record<GoogleCacheCategory, string>;
  expiresAt: string;
}

export interface GeminiGroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

export interface GeminiGroundingSupport {
  segment?: {
    startIndex?: number;
    endIndex?: number;
    text?: string;
  };
  groundingChunkIndices?: number[];
}

export interface GeminiGroundingMetadata {
  webSearchQueries?: string[];
  groundingChunks?: GeminiGroundingChunk[];
  groundingSupports?: GeminiGroundingSupport[];
  searchEntryPoint?: {
    renderedContent?: string;
  };
}

export interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    groundingMetadata?: GeminiGroundingMetadata;
    finishReason?: string;
    safetyRatings?: Array<{
      category?: string;
      blocked?: boolean;
    }>;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  error?: {
    message?: string;
    code?: number;
    status?: string;
  };
}

export interface GeminiGroundingDiagnostics {
  httpStatus: number | null;
  model: string;
  groundingFallbackUsed: boolean;
  geminiErrorCode: number | null;
  geminiErrorMessage: string | null;
  candidateCount: number;
  finishReason: string | null;
  safetyBlockReason: string | null;
  hasResponseText: boolean;
  hasGroundingMetadata: boolean;
  parseFailureReason: string | null;
  failureReason: string | null;
  groundingChunksCount: number;
  groundingSupportsCount: number;
  webSearchQueriesCount: number;
}

export interface GeminiGroundingFetchOutcome {
  result: GoogleSearchLiveResult | null;
  diagnostics: GeminiGroundingDiagnostics;
}

export interface GeminiFootballMatchRecord {
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number | null;
  awayGoals: number | null;
  competition: string;
  competitionType: "league" | "cup" | "friendly" | "other";
  venue: "home" | "away" | "neutral";
  neutralVenue: boolean;
  includesExtraTime: boolean;
  includesPenalties: boolean;
  sourceUrl?: string;
}

export interface GeminiFootballStructuredResponse {
  recentFormLast10Official: GeminiFootballMatchRecord[];
  recentFormLast5Home: GeminiFootballMatchRecord[];
  recentFormLast5Away: GeminiFootballMatchRecord[];
  includesFriendlies: boolean;
  includesExtraTime: boolean;
  includesPenalties: boolean;
  h2hLast5Official: GeminiFootballMatchRecord[];
  standings: Array<{
    teamName: string;
    rank: number | null;
    played: number | null;
    points: number | null;
    goalsFor: number | null;
    goalsAgainst: number | null;
    sourceUrl?: string;
  }>;
  homeMetrics: {
    goalsFor: number | null;
    goalsAgainst: number | null;
    xg: number | null;
    xga: number | null;
    shots: number | null;
    shotsOnTarget: number | null;
    possession: number | null;
    cleanSheets: number | null;
    failedToScore: number | null;
  } | null;
  awayMetrics: {
    goalsFor: number | null;
    goalsAgainst: number | null;
    xg: number | null;
    xga: number | null;
    shots: number | null;
    shotsOnTarget: number | null;
    possession: number | null;
    cleanSheets: number | null;
    failedToScore: number | null;
  } | null;
  injuries: Array<{
    teamName: string;
    playerName: string;
    reason: string;
    status: string;
    sourceUrl?: string;
  }>;
  suspensions: Array<{
    teamName: string;
    playerName: string;
    reason: string;
    status: string;
    sourceUrl?: string;
  }>;
  matchStatus: {
    importance: string | null;
    mustWin: boolean | null;
    alreadyQualified: boolean | null;
    alreadyEliminated: boolean | null;
    weather: string | null;
    longTravelAway: boolean | null;
    congestedSchedule: boolean | null;
    coachNews: string | null;
    officialNews: string | null;
    rotation: string | null;
  } | null;
}

export interface GoogleSearchProviderConfig {
  apiKey?: string;
  model?: string;
  fallbackModel?: string;
  timeoutMs?: number;
  maxRequestsPerMinute?: number;
}
