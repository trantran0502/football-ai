export type {
  GeminiFootballStructuredResponse,
  GeminiGenerateContentResponse,
  GoogleCacheCategory,
  GoogleSearchCachedRecord,
  GoogleSearchLiveResult,
  GoogleSearchMatchRequest,
  GoogleSearchProviderConfig,
} from "@/lib/providers/googleSearch/googleSearchTypes";

export { GOOGLE_CACHE_TTL_MS } from "@/lib/providers/googleSearch/googleSearchTypes";

export {
  buildGeminiGroundingPrompt,
  buildGeminiSearchQuery,
  GEMINI_FOOTBALL_RESPONSE_SCHEMA,
} from "@/lib/providers/googleSearch/googleSearchPrompt";

export {
  mapGeminiStructuredToHybridPayload,
  parseGeminiStructuredJson,
} from "@/lib/providers/googleSearch/googleSearchMapper";

export {
  buildCategoryExpiresAt,
  readGoogleSearchSupabaseCache,
  resolveBundleExpiresAt,
  writeGoogleSearchSupabaseCache,
} from "@/lib/providers/googleSearch/googleSearchSupabaseCache";

export {
  buildGoogleMatchKey,
  buildGoogleSearchCacheKey,
  dedupeGoogleFetch,
  getCachedGooglePayload,
  getCachedGoogleRecord,
  rememberGoogleLiveResult,
  rememberGooglePayload,
  resetGoogleSearchCacheForTests,
} from "@/lib/providers/googleSearch/googleSearchCache";

export {
  fetchGoogleHybridPayload,
  fetchGoogleLiveResult,
  TEAM_CONTEXT_QUERY,
} from "@/lib/providers/googleSearch/googleSearchService";

export {
  getGoogleSearchProvider,
  GoogleSearchProvider,
  resetGoogleSearchProviderForTests,
  setGeminiFetchForTests,
  setGoogleSearchProviderForTests,
} from "@/lib/providers/googleSearch/googleSearchProvider";

export {
  getGoogleSearchClient,
  setGoogleSearchClientForTests,
} from "@/lib/providers/googleSearch/googleSearchClient";
