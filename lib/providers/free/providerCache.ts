import {
  CLIENT_CACHE_PREFIX,
  CLIENT_FINAL_SCORE_PREFIX,
  CLIENT_USAGE_KEY,
  FIXTURE_CACHE_TTL_MS,
  RECENT_MATCHES_CACHE_TTL_MS,
} from "@/lib/providers/free/config";
import type { ApiUsageInfo, TeamDataPackage } from "@/lib/providers/free/types";

interface CacheEntry<T> {
  savedAt: string;
  expiresAt: string;
  data: T;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readEntry<T>(key: string): CacheEntry<T> | null {
  if (!isBrowser()) {
    return null;
  }
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

function writeEntry<T>(key: string, data: T, ttlMs: number): void {
  if (!isBrowser()) {
    return;
  }
  const now = Date.now();
  const entry: CacheEntry<T> = {
    savedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    data,
  };
  window.localStorage.setItem(key, JSON.stringify(entry));
}

function isValidEntry<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  if (!entry) {
    return false;
  }
  return Date.now() < new Date(entry.expiresAt).getTime();
}

export function buildFixtureCacheKey(
  homeTeam: string,
  awayTeam: string,
  matchDate?: string
): string {
  return `${CLIENT_CACHE_PREFIX}:fixture:${homeTeam}:${awayTeam}:${matchDate ?? "any"}`;
}

export function buildRecentCacheKey(teamName: string): string {
  return `${CLIENT_CACHE_PREFIX}:recent:${teamName}`;
}

export function getCachedTeamData(
  cacheKey: string
): TeamDataPackage | null {
  const entry = readEntry<TeamDataPackage>(cacheKey);
  if (!isValidEntry(entry)) {
    return null;
  }
  return entry.data;
}

export function setCachedTeamData(
  cacheKey: string,
  data: TeamDataPackage,
  ttlMs: number = FIXTURE_CACHE_TTL_MS
): void {
  writeEntry(cacheKey, data, ttlMs);
}

export function getCachedRecentData<T>(teamName: string): T | null {
  const entry = readEntry<T>(buildRecentCacheKey(teamName));
  if (!isValidEntry(entry)) {
    return null;
  }
  return entry.data;
}

export function setCachedRecentData<T>(
  teamName: string,
  data: T
): void {
  writeEntry(buildRecentCacheKey(teamName), data, RECENT_MATCHES_CACHE_TTL_MS);
}

export function saveFinalScorePermanently(
  fixtureId: number,
  score: unknown
): void {
  if (!isBrowser()) {
    return;
  }
  const key = `${CLIENT_FINAL_SCORE_PREFIX}:${fixtureId}`;
  window.localStorage.setItem(
    key,
    JSON.stringify({ savedAt: new Date().toISOString(), score })
  );
}

export function getStoredApiUsage(): ApiUsageInfo | null {
  if (!isBrowser()) {
    return null;
  }
  const raw = window.localStorage.getItem(CLIENT_USAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as ApiUsageInfo;
  } catch {
    return null;
  }
}

export function saveApiUsage(usage: ApiUsageInfo): void {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.setItem(CLIENT_USAGE_KEY, JSON.stringify(usage));
}
