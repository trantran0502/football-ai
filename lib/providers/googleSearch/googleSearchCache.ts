import type { HybridSourcePayload } from "@/lib/hybrid/hybridTypes";
import type {
  GoogleSearchCachedRecord,
  GoogleSearchLiveResult,
} from "@/lib/providers/googleSearch/googleSearchTypes";
import {
  buildCategoryExpiresAt,
  readGoogleSearchSupabaseCache,
  resolveBundleExpiresAt,
  writeGoogleSearchSupabaseCache,
} from "@/lib/providers/googleSearch/googleSearchSupabaseCache";
import { stableSerialize } from "@/lib/providers/registry/cacheKey";

const MAX_SEARCHES_PER_MATCH = 6;

const recordCache = new Map<string, GoogleSearchCachedRecord>();
const matchSearchCounts = new Map<string, number>();
const inFlightQueries = new Map<string, Promise<GoogleSearchLiveResult | null>>();

export function buildGoogleSearchCacheKey(input: {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
  query: string;
}): string {
  return stableSerialize({
    provider: "googleSearch",
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    matchDate: input.matchDate ?? "",
    query: input.query,
  });
}

export function buildGoogleMatchKey(input: {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
}): string {
  return stableSerialize({
    provider: "googleSearchMatch",
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    matchDate: input.matchDate ?? "",
  });
}

export function getCachedGoogleRecord(
  cacheKey: string
): GoogleSearchCachedRecord | null {
  const cached = recordCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  if (Date.parse(cached.expiresAt) <= Date.now()) {
    recordCache.delete(cacheKey);
    return null;
  }
  return cached;
}

export function getCachedGooglePayload(cacheKey: string): HybridSourcePayload | null {
  return getCachedGoogleRecord(cacheKey)?.payload ?? null;
}

export function rememberGoogleLiveResult(
  cacheKey: string,
  result: GoogleSearchLiveResult
): GoogleSearchCachedRecord {
  const categoryExpiresAt = buildCategoryExpiresAt(result.searchTime);
  const record: GoogleSearchCachedRecord = {
    payload: result.payload,
    citations: result.citations,
    confidence: result.confidence,
    searchTime: result.searchTime,
    query: result.query,
    rawResponse: result.rawResponse,
    categoryExpiresAt,
    expiresAt: resolveBundleExpiresAt(categoryExpiresAt),
  };
  recordCache.set(cacheKey, record);
  void writeGoogleSearchSupabaseCache(cacheKey, record);
  return record;
}

export function rememberGooglePayload(
  cacheKey: string,
  payload: HybridSourcePayload
): GoogleSearchCachedRecord {
  const searchTime = new Date().toISOString();
  return rememberGoogleLiveResult(cacheKey, {
    payload: {
      ...payload,
      fetchedAt: searchTime,
    },
    citations: payload.citations,
    confidence: payload.confidence,
    searchTime,
    query: payload.queries[0] ?? "team context grounding",
    rawResponse: null,
  });
}

export async function getCachedGoogleRecordAsync(
  cacheKey: string
): Promise<GoogleSearchCachedRecord | null> {
  const memoryHit = getCachedGoogleRecord(cacheKey);
  if (memoryHit) {
    return memoryHit;
  }

  const supabaseHit = await readGoogleSearchSupabaseCache(cacheKey);
  if (supabaseHit) {
    recordCache.set(cacheKey, supabaseHit);
    return supabaseHit;
  }

  return null;
}

export function canSearchForMatch(matchKey: string): boolean {
  return (matchSearchCounts.get(matchKey) ?? 0) < MAX_SEARCHES_PER_MATCH;
}

export function recordMatchSearch(matchKey: string): void {
  matchSearchCounts.set(matchKey, (matchSearchCounts.get(matchKey) ?? 0) + 1);
}

export function dedupeGoogleFetch(
  cacheKey: string,
  fetcher: () => Promise<GoogleSearchLiveResult | null>
): Promise<GoogleSearchLiveResult | null> {
  const cached = getCachedGoogleRecord(cacheKey);
  if (cached) {
    return Promise.resolve({
      payload: cached.payload,
      citations: cached.citations,
      confidence: cached.confidence,
      searchTime: cached.searchTime,
      query: cached.query,
      rawResponse: cached.rawResponse,
    });
  }

  const inFlight = inFlightQueries.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const promise = fetcher().finally(() => {
    inFlightQueries.delete(cacheKey);
  });
  inFlightQueries.set(cacheKey, promise);
  return promise;
}

export function resetGoogleSearchCacheForTests(): void {
  recordCache.clear();
  matchSearchCounts.clear();
  inFlightQueries.clear();
}
