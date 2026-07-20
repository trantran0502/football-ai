export interface GroundingRuntimeMetricsSnapshot {
  groundingConfigured: boolean;
  groundingCalled: number;
  groundingSucceeded: number;
  groundingCacheHit: number;
  groundingFailureReason: string | null;
  groundingSearchCount: number;
}

const metrics: GroundingRuntimeMetricsSnapshot = {
  groundingConfigured: false,
  groundingCalled: 0,
  groundingSucceeded: 0,
  groundingCacheHit: 0,
  groundingFailureReason: null,
  groundingSearchCount: 0,
};

export function resetGroundingRuntimeMetricsForTests(): void {
  metrics.groundingConfigured = false;
  metrics.groundingCalled = 0;
  metrics.groundingSucceeded = 0;
  metrics.groundingCacheHit = 0;
  metrics.groundingFailureReason = null;
  metrics.groundingSearchCount = 0;
}

export function initializeGroundingRuntimeMetrics(configured: boolean): void {
  metrics.groundingConfigured = configured;
}

export function recordGroundingCacheHit(): void {
  metrics.groundingCacheHit += 1;
  metrics.groundingSearchCount += 1;
}

export function recordGroundingLiveCall(input: {
  succeeded: boolean;
  failureReason?: string | null;
}): void {
  metrics.groundingCalled += 1;
  metrics.groundingSearchCount += 1;
  if (input.succeeded) {
    metrics.groundingSucceeded += 1;
    return;
  }
  metrics.groundingFailureReason = input.failureReason ?? "grounding_fetch_failed";
}

export function recordGroundingNotConfigured(): void {
  metrics.groundingFailureReason = "not_configured";
}

export function getGroundingRuntimeMetricsSnapshot(): GroundingRuntimeMetricsSnapshot {
  return { ...metrics };
}
