import type { ApiFootballPlanSeasonRange } from "@/lib/providers/apiFootball/apiFootballPlanErrors";

const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;

interface CachedPlanRestriction {
  planRange: ApiFootballPlanSeasonRange;
  cachedAt: number;
}

const restrictionCache = new Map<string, CachedPlanRestriction>();

const metrics = {
  planRestrictedRequestsAvoided: 0,
  capabilityCacheHit: 0,
  effectiveProfileSeason: null as number | null,
};

function buildCacheKey(leagueId: number | null, requestedSeason: number): string {
  return `${leagueId ?? -1}:${requestedSeason}`;
}

export function resetPlanCapabilityCacheForTests(): void {
  restrictionCache.clear();
  metrics.planRestrictedRequestsAvoided = 0;
  metrics.capabilityCacheHit = 0;
  metrics.effectiveProfileSeason = null;
}

export function beginPlanCapabilityMetricsBatch(): void {
  metrics.planRestrictedRequestsAvoided = 0;
  metrics.capabilityCacheHit = 0;
  metrics.effectiveProfileSeason = null;
}

export function cachePlanSeasonRestriction(input: {
  leagueId: number | null;
  requestedSeason: number;
  planRange: ApiFootballPlanSeasonRange;
}): void {
  restrictionCache.set(buildCacheKey(input.leagueId, input.requestedSeason), {
    planRange: input.planRange,
    cachedAt: Date.now(),
  });
  metrics.effectiveProfileSeason = input.planRange.maxSeason;
}

export function getCachedPlanSeasonRestriction(
  leagueId: number | null,
  requestedSeason: number,
  now = Date.now()
): ApiFootballPlanSeasonRange | null {
  const key = buildCacheKey(leagueId, requestedSeason);
  const entry = restrictionCache.get(key);
  if (!entry) {
    return null;
  }
  if (now - entry.cachedAt > DEFAULT_CACHE_TTL_MS) {
    restrictionCache.delete(key);
    return null;
  }
  return entry.planRange;
}

export function resolveProfileFetchSeason(input: {
  leagueId: number | null;
  requestedSeason: number | null;
  now?: number;
}): {
  initialFetchSeason: number | null;
  skipRequestedSeasonAttempt: boolean;
  capabilityCacheHit: boolean;
  effectiveProfileSeason: number | null;
} {
  if (input.requestedSeason === null) {
    return {
      initialFetchSeason: null,
      skipRequestedSeasonAttempt: false,
      capabilityCacheHit: false,
      effectiveProfileSeason: null,
    };
  }

  const cached = getCachedPlanSeasonRestriction(
    input.leagueId,
    input.requestedSeason,
    input.now
  );
  if (cached) {
    metrics.capabilityCacheHit += 1;
    metrics.planRestrictedRequestsAvoided += 1;
    metrics.effectiveProfileSeason = cached.maxSeason;
    return {
      initialFetchSeason: cached.maxSeason,
      skipRequestedSeasonAttempt: true,
      capabilityCacheHit: true,
      effectiveProfileSeason: cached.maxSeason,
    };
  }

  return {
    initialFetchSeason: input.requestedSeason,
    skipRequestedSeasonAttempt: false,
    capabilityCacheHit: false,
    effectiveProfileSeason: input.requestedSeason,
  };
}

export function recordPlanRestrictedRequestAvoided(count = 1): void {
  metrics.planRestrictedRequestsAvoided += count;
}

export function setEffectiveProfileSeason(season: number | null): void {
  metrics.effectiveProfileSeason = season;
}

export function getPlanCapabilityMetricsSnapshot(): {
  planRestrictedRequestsAvoided: number;
  capabilityCacheHit: number;
  effectiveProfileSeason: number | null;
} {
  return { ...metrics };
}
