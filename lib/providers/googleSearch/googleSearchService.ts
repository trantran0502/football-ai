import {
  buildGoogleMatchKey,
  buildGoogleSearchCacheKey,
  canSearchForMatch,
  dedupeGoogleFetch,
  getCachedGoogleRecordAsync,
  recordMatchSearch,
  rememberGoogleLiveResult,
} from "@/lib/providers/googleSearch/googleSearchCache";
import {
  getGoogleSearchProvider,
  type GoogleSearchMatchRequest,
} from "@/lib/providers/googleSearch/googleSearchProvider";
import type { HybridSourcePayload } from "@/lib/hybrid/hybridTypes";
import type { GoogleSearchLiveResult } from "@/lib/providers/googleSearch/googleSearchTypes";
import {
  initializeGroundingRuntimeMetrics,
  recordGroundingCacheHit,
  recordGroundingLiveCall,
  recordGroundingNotConfigured,
} from "@/lib/admin/groundingRuntimeMetrics";
import { recordCacheHit, recordCacheMiss } from "@/lib/admin/adminCacheMetrics";

const TEAM_CONTEXT_QUERY = "team context grounding";

export interface GoogleFetchOutcome {
  result: GoogleSearchLiveResult | null;
  cacheHit: boolean;
  configured: boolean;
  called: boolean;
  failureReason: string | null;
}

function buildNormalizedGroundingPayload(
  result: GoogleSearchLiveResult,
  source: "live" | "cache"
): Record<string, unknown> {
  return {
    source: "google-grounding",
    captureSource: source,
    query: result.query,
    capturedAt: result.searchTime,
    confidence: result.confidence,
    citations: result.citations,
    payload: result.payload,
  };
}

export async function fetchGoogleLiveResultWithOutcome(
  request: GoogleSearchMatchRequest
): Promise<GoogleFetchOutcome> {
  const provider = getGoogleSearchProvider();
  const configured = provider.isConfigured();
  initializeGroundingRuntimeMetrics(configured);

  if (!configured) {
    recordGroundingNotConfigured();
    return {
      result: null,
      cacheHit: false,
      configured: false,
      called: false,
      failureReason: "not_configured",
    };
  }

  const matchKey = buildGoogleMatchKey(request);
  const cacheKey = buildGoogleSearchCacheKey({
    ...request,
    query: TEAM_CONTEXT_QUERY,
  });

  const cached = await getCachedGoogleRecordAsync(cacheKey);
  if (cached) {
    recordGroundingCacheHit();
    recordCacheHit();
    const result: GoogleSearchLiveResult = {
      payload: cached.payload,
      citations: cached.citations,
      confidence: cached.confidence,
      searchTime: cached.searchTime,
      query: cached.query,
      rawResponse: cached.rawResponse ?? buildNormalizedGroundingPayload(
        {
          payload: cached.payload,
          citations: cached.citations,
          confidence: cached.confidence,
          searchTime: cached.searchTime,
          query: cached.query,
          rawResponse: cached.rawResponse,
        },
        "cache"
      ),
    };
    return {
      result,
      cacheHit: true,
      configured: true,
      called: false,
      failureReason: null,
    };
  }

  recordCacheMiss();

  if (!canSearchForMatch(matchKey)) {
    recordGroundingLiveCall({ succeeded: false, failureReason: "match_search_limit_reached" });
    return {
      result: null,
      cacheHit: false,
      configured: true,
      called: false,
      failureReason: "match_search_limit_reached",
    };
  }

  const liveResult = await dedupeGoogleFetch(cacheKey, async () => {
    recordMatchSearch(matchKey);
    try {
      const result = await provider.fetchTeamContext(request);
      if (!result) {
        recordGroundingLiveCall({ succeeded: false, failureReason: "empty_grounding_response" });
        return null;
      }
      const normalizedRaw = buildNormalizedGroundingPayload(result, "live");
      const persisted: GoogleSearchLiveResult = {
        ...result,
        rawResponse: normalizedRaw,
      };
      rememberGoogleLiveResult(cacheKey, persisted);
      recordGroundingLiveCall({ succeeded: true });
      return persisted;
    } catch (error) {
      const failureReason =
        error instanceof Error ? error.message : "grounding_fetch_failed";
      recordGroundingLiveCall({ succeeded: false, failureReason });
      console.warn("Gemini unavailable:", error);
      return null;
    }
  });

  return {
    result: liveResult,
    cacheHit: false,
    configured: true,
    called: true,
    failureReason: liveResult ? null : "grounding_fetch_failed",
  };
}

export async function fetchGoogleLiveResult(
  request: GoogleSearchMatchRequest
): Promise<GoogleSearchLiveResult | null> {
  const outcome = await fetchGoogleLiveResultWithOutcome(request);
  return outcome.result;
}

export async function fetchGoogleHybridPayload(
  request: GoogleSearchMatchRequest
): Promise<HybridSourcePayload | null> {
  const result = await fetchGoogleLiveResult(request);
  return result?.payload ?? null;
}

export { TEAM_CONTEXT_QUERY };
