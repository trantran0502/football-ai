export interface ProfileCacheMetricsSnapshot {
  profileCacheHit: number;
  profileCacheMiss: number;
  uniqueTeamsRequested: number;
  duplicateTeamRequestsAvoided: number;
  deferredProfileRetried: number;
  deferredProfileCompleted: number;
}

const metrics: ProfileCacheMetricsSnapshot = {
  profileCacheHit: 0,
  profileCacheMiss: 0,
  uniqueTeamsRequested: 0,
  duplicateTeamRequestsAvoided: 0,
  deferredProfileRetried: 0,
  deferredProfileCompleted: 0,
};

const requestedTeamsThisBatch = new Set<string>();
const batchDedupeKeys = new Set<string>();

export function resetProfileCacheMetricsForTests(): void {
  metrics.profileCacheHit = 0;
  metrics.profileCacheMiss = 0;
  metrics.uniqueTeamsRequested = 0;
  metrics.duplicateTeamRequestsAvoided = 0;
  metrics.deferredProfileRetried = 0;
  metrics.deferredProfileCompleted = 0;
  requestedTeamsThisBatch.clear();
  batchDedupeKeys.clear();
}

export function beginProfileCacheMetricsBatch(): void {
  requestedTeamsThisBatch.clear();
  batchDedupeKeys.clear();
}

export function teamProfileBatchKey(
  teamId: number,
  leagueId: number | null,
  season: number | null
): string {
  return `${teamId}:${leagueId ?? -1}:${season ?? -1}`;
}

export function registerProfileTeamRequest(
  teamId: number,
  leagueId: number | null,
  season: number | null
): "new" | "duplicate" {
  const key = teamProfileBatchKey(teamId, leagueId, season);
  if (batchDedupeKeys.has(key)) {
    metrics.duplicateTeamRequestsAvoided += 1;
    return "duplicate";
  }
  batchDedupeKeys.add(key);
  if (!requestedTeamsThisBatch.has(key)) {
    requestedTeamsThisBatch.add(key);
    metrics.uniqueTeamsRequested += 1;
  }
  return "new";
}

export function recordProfileCacheHit(): void {
  metrics.profileCacheHit += 1;
}

export function recordProfileCacheMiss(): void {
  metrics.profileCacheMiss += 1;
}

export function recordDeferredProfileRetried(count = 1): void {
  metrics.deferredProfileRetried += count;
}

export function recordDeferredProfileCompleted(count = 1): void {
  metrics.deferredProfileCompleted += count;
}

export function getProfileCacheMetricsSnapshot(): ProfileCacheMetricsSnapshot {
  return { ...metrics };
}
