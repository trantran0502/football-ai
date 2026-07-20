import type { GeminiGroundingDiagnostics } from "@/lib/providers/googleSearch/googleSearchTypes";

export interface GroundingRuntimeMetricsSnapshot {
  groundingConfigured: boolean;
  groundingCalled: number;
  groundingSucceeded: number;
  groundingCacheHit: number;
  groundingFailureReason: string | null;
  groundingSearchCount: number;
  groundingHttpStatus: number | null;
  groundingModel: string | null;
  groundingCandidateCount: number;
  groundingSafetyBlockedCount: number;
  groundingParseFailureCount: number;
  groundingFallbackUsed: boolean;
}

const metrics: GroundingRuntimeMetricsSnapshot = {
  groundingConfigured: false,
  groundingCalled: 0,
  groundingSucceeded: 0,
  groundingCacheHit: 0,
  groundingFailureReason: null,
  groundingSearchCount: 0,
  groundingHttpStatus: null,
  groundingModel: null,
  groundingCandidateCount: 0,
  groundingSafetyBlockedCount: 0,
  groundingParseFailureCount: 0,
  groundingFallbackUsed: false,
};

export function resetGroundingRuntimeMetricsForTests(): void {
  metrics.groundingConfigured = false;
  metrics.groundingCalled = 0;
  metrics.groundingSucceeded = 0;
  metrics.groundingCacheHit = 0;
  metrics.groundingFailureReason = null;
  metrics.groundingSearchCount = 0;
  metrics.groundingHttpStatus = null;
  metrics.groundingModel = null;
  metrics.groundingCandidateCount = 0;
  metrics.groundingSafetyBlockedCount = 0;
  metrics.groundingParseFailureCount = 0;
  metrics.groundingFallbackUsed = false;
}

export function beginGroundingRuntimeMetricsBatch(configured: boolean): void {
  resetGroundingRuntimeMetricsForTests();
  metrics.groundingConfigured = configured;
  metrics.groundingFailureReason = configured ? null : "not_configured";
}

export function initializeGroundingRuntimeMetrics(configured: boolean): void {
  metrics.groundingConfigured = configured;
  if (!configured) {
    metrics.groundingFailureReason = "not_configured";
  }
}

export function recordGroundingCacheHit(): void {
  metrics.groundingCacheHit += 1;
  metrics.groundingSearchCount += 1;
}

export function recordGroundingLiveCall(input: {
  succeeded: boolean;
  failureReason?: string | null;
  diagnostics?: GeminiGroundingDiagnostics;
}): void {
  metrics.groundingCalled += 1;
  metrics.groundingSearchCount += 1;

  if (input.diagnostics) {
    metrics.groundingHttpStatus = input.diagnostics.httpStatus;
    metrics.groundingModel = input.diagnostics.model;
    metrics.groundingCandidateCount = Math.max(
      metrics.groundingCandidateCount,
      input.diagnostics.candidateCount
    );
    if (input.diagnostics.failureReason === "safety_blocked") {
      metrics.groundingSafetyBlockedCount += 1;
    }
    if (input.diagnostics.parseFailureReason) {
      metrics.groundingParseFailureCount += 1;
    }
    if (input.diagnostics.groundingFallbackUsed) {
      metrics.groundingFallbackUsed = true;
    }
  }

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
