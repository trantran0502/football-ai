import {
  buildApiFootballCacheKey,
  getApiFootballCacheStore,
  type ApiFootballCacheStore,
} from "@/lib/providers/apiFootball/apiFootballCache";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";

export function buildResultUpdateFixturesByDateCacheKey(date: string): string {
  return buildApiFootballCacheKey("fixture", {
    scope: "result-update-by-date",
    date,
  });
}

export async function readResultUpdateFixturesByDateCache(
  date: string,
  cacheStore: ApiFootballCacheStore = getApiFootballCacheStore()
): Promise<ApiFootballFixtureRecord[] | null> {
  const cacheKey = buildResultUpdateFixturesByDateCacheKey(date);
  return cacheStore.get<ApiFootballFixtureRecord[]>(cacheKey);
}

export function writeResultUpdateFixturesByDateCache(
  date: string,
  fixtures: ApiFootballFixtureRecord[],
  cacheStore: ApiFootballCacheStore = getApiFootballCacheStore()
): void {
  const cacheKey = buildResultUpdateFixturesByDateCacheKey(date);
  cacheStore.set(cacheKey, "fixture", fixtures);
}
