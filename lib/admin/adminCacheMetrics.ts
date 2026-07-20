import { getProfileCacheMetricsSnapshot } from "@/lib/teamProfile/profileCacheMetrics";
import { getGroundingRuntimeMetricsSnapshot } from "@/lib/admin/groundingRuntimeMetrics";

let hits = 0;
let misses = 0;

export function recordCacheHit(): void {
  hits += 1;
}

export function recordCacheMiss(): void {
  misses += 1;
}

export function getCacheMetricsSnapshot(): {
  hitRate: number;
  hits: number;
  misses: number;
  profileCacheHits: number;
  profileCacheMisses: number;
  groundingCacheHits: number;
} {
  const profile = getProfileCacheMetricsSnapshot();
  const grounding = getGroundingRuntimeMetricsSnapshot();
  const combinedHits = hits + profile.profileCacheHit + grounding.groundingCacheHit;
  const combinedMisses = misses + profile.profileCacheMiss;
  const total = combinedHits + combinedMisses;
  return {
    hits: combinedHits,
    misses: combinedMisses,
    hitRate: total > 0 ? Math.round((combinedHits / total) * 1000) / 1000 : 0,
    profileCacheHits: profile.profileCacheHit,
    profileCacheMisses: profile.profileCacheMiss,
    groundingCacheHits: grounding.groundingCacheHit,
  };
}

export function resetCacheMetricsForTests(): void {
  hits = 0;
  misses = 0;
}
