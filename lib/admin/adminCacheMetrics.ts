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
} {
  const total = hits + misses;
  return {
    hits,
    misses,
    hitRate: total > 0 ? Math.round((hits / total) * 1000) / 1000 : 0,
  };
}

export function resetCacheMetricsForTests(): void {
  hits = 0;
  misses = 0;
}
