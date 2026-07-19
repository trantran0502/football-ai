import {
  buildApiFootballCacheKey,
  getApiFootballCacheStore,
  type ApiFootballCacheStore,
} from "@/lib/providers/apiFootball/apiFootballCache";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";

export const GLOBAL_FIXTURES_BY_DATE_CACHE_SCOPE = "fixtures-by-date";

/** @deprecated Legacy scope kept for read fallback only. */
const LEGACY_RESULT_UPDATE_FIXTURES_CACHE_SCOPE = "result-update-by-date";

export function buildGlobalFixturesByDateCacheKey(date: string): string {
  return buildApiFootballCacheKey("fixture", {
    scope: GLOBAL_FIXTURES_BY_DATE_CACHE_SCOPE,
    date,
  });
}

export function buildResultUpdateFixturesByDateCacheKey(date: string): string {
  return buildGlobalFixturesByDateCacheKey(date);
}

function buildLegacyResultUpdateFixturesByDateCacheKey(date: string): string {
  return buildApiFootballCacheKey("fixture", {
    scope: LEGACY_RESULT_UPDATE_FIXTURES_CACHE_SCOPE,
    date,
  });
}

export async function readGlobalFixturesByDateCache(
  date: string,
  cacheStore: ApiFootballCacheStore = getApiFootballCacheStore()
): Promise<ApiFootballFixtureRecord[] | null> {
  const cacheKey = buildGlobalFixturesByDateCacheKey(date);
  const cached = await cacheStore.get<ApiFootballFixtureRecord[]>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const legacyKey = buildLegacyResultUpdateFixturesByDateCacheKey(date);
  return cacheStore.get<ApiFootballFixtureRecord[]>(legacyKey);
}

export async function readResultUpdateFixturesByDateCache(
  date: string,
  cacheStore: ApiFootballCacheStore = getApiFootballCacheStore()
): Promise<ApiFootballFixtureRecord[] | null> {
  return readGlobalFixturesByDateCache(date, cacheStore);
}

export function writeGlobalFixturesByDateCache(
  date: string,
  fixtures: ApiFootballFixtureRecord[],
  cacheStore: ApiFootballCacheStore = getApiFootballCacheStore()
): void {
  const cacheKey = buildGlobalFixturesByDateCacheKey(date);
  cacheStore.set(cacheKey, "fixture", fixtures);
}

export function writeResultUpdateFixturesByDateCache(
  date: string,
  fixtures: ApiFootballFixtureRecord[],
  cacheStore: ApiFootballCacheStore = getApiFootballCacheStore()
): void {
  writeGlobalFixturesByDateCache(date, fixtures, cacheStore);
}
