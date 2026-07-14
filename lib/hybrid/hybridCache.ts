import type { NormalizedTeamContext } from "@/lib/hybrid/hybridTypes";
import { stableSerialize } from "@/lib/providers/registry/cacheKey";

const DEFAULT_TTL_MS = 60 * 60 * 1000;

interface CachedHybridContext {
  context: NormalizedTeamContext;
  expiresAt: string;
}

const memoryCache = new Map<string, CachedHybridContext>();
const inFlight = new Map<string, Promise<NormalizedTeamContext>>();

export function buildHybridCacheKey(input: {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
}): string {
  return stableSerialize({
    provider: "hybridContext",
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    matchDate: input.matchDate ?? "",
  });
}

export function getCachedHybridContext(
  cacheKey: string
): NormalizedTeamContext | null {
  const cached = memoryCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  if (Date.parse(cached.expiresAt) <= Date.now()) {
    memoryCache.delete(cacheKey);
    return null;
  }
  return cached.context;
}

export function rememberHybridContext(
  cacheKey: string,
  context: NormalizedTeamContext,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  memoryCache.set(cacheKey, {
    context,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  });
}

export function dedupeHybridResolve(
  cacheKey: string,
  resolver: () => Promise<NormalizedTeamContext>
): Promise<NormalizedTeamContext> {
  const cached = getCachedHybridContext(cacheKey);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = inFlight.get(cacheKey);
  if (pending) {
    return pending;
  }

  const promise = resolver().finally(() => {
    inFlight.delete(cacheKey);
  });
  inFlight.set(cacheKey, promise);
  return promise;
}

export function resetHybridCacheForTests(): void {
  memoryCache.clear();
  inFlight.clear();
}
