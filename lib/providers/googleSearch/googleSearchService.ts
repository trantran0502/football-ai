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

const TEAM_CONTEXT_QUERY = "team context grounding";

export async function fetchGoogleLiveResult(
  request: GoogleSearchMatchRequest
): Promise<GoogleSearchLiveResult | null> {
  const matchKey = buildGoogleMatchKey(request);
  const cacheKey = buildGoogleSearchCacheKey({
    ...request,
    query: TEAM_CONTEXT_QUERY,
  });

  const cached = await getCachedGoogleRecordAsync(cacheKey);
  if (cached) {
    return {
      payload: cached.payload,
      citations: cached.citations,
      confidence: cached.confidence,
      searchTime: cached.searchTime,
      query: cached.query,
      rawResponse: cached.rawResponse,
    };
  }

  if (!canSearchForMatch(matchKey)) {
    return null;
  }

  const provider = getGoogleSearchProvider();
  if (!provider.isConfigured()) {
    return null;
  }

  return dedupeGoogleFetch(cacheKey, async () => {
    recordMatchSearch(matchKey);
    const result = await provider.fetchTeamContext(request);
    if (!result) {
      return null;
    }
    rememberGoogleLiveResult(cacheKey, result);
    return result;
  });
}

export async function fetchGoogleHybridPayload(
  request: GoogleSearchMatchRequest
): Promise<HybridSourcePayload | null> {
  const result = await fetchGoogleLiveResult(request);
  return result?.payload ?? null;
}

export { TEAM_CONTEXT_QUERY };
