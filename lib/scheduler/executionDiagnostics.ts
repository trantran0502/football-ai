import type { WeightConfigSnapshotMetadata } from "@/lib/recommendation/weightConfigTypes";
import { getGroundingRuntimeMetricsSnapshot } from "@/lib/admin/groundingRuntimeMetrics";
import { getGroundingRequestBudgetSnapshot } from "@/lib/providers/googleSearch/groundingRequestBudget";
import type { ProductionCombinedGroundingPrefetchResult } from "@/lib/providers/googleSearch/combinedGroundingProvider";
import { getPlanCapabilityMetricsSnapshot } from "@/lib/teamProfile/planCapabilityCache";
import {
  getProfileCacheMetricsSnapshot,
  type ProfileCacheMetricsSnapshot,
} from "@/lib/teamProfile/profileCacheMetrics";

export interface FixtureGroundingChannelDiagnostic {
  called: boolean;
  cacheHit: boolean;
  skippedReason: string | null;
  succeeded?: boolean;
  failureReason?: string | null;
  httpStatus?: number | null;
  model?: string | null;
  candidateCount?: number;
  parseFailureReason?: string | null;
  groundingFallbackUsed?: boolean;
  hasResponseText?: boolean;
  hasGroundingMetadata?: boolean;
}

export interface FixtureGroundingDiagnostic {
  fixtureId: number;
  combinedGroundingRequestId: string | null;
  combinedGroundingLiveRequest: boolean;
  squadAvailability: FixtureGroundingChannelDiagnostic;
  matchContext: FixtureGroundingChannelDiagnostic;
}

export interface DailyAnalysisObservabilityDiagnostics {
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
  groundingRequestBudget: number;
  groundingRequestsUsed: number;
  groundingRequestsAvoidedByCache: number;
  groundingRequestsAvoidedByBudget: number;
  groundingRateLimitTriggered: boolean;
  groundingCooldownActive: boolean;
  groundingDeferredCount: number;
  combinedGroundingRequestCount: number;
  profileCacheHit: number;
  profileCacheMiss: number;
  uniqueTeamsRequested: number;
  duplicateTeamRequestsAvoided: number;
  profileRequestsAvoidedByQuota: number;
  deferredProfileRetried: number;
  deferredProfileCompleted: number;
  planRestrictedRequestsAvoided: number;
  effectiveProfileSeason: number | null;
  capabilityCacheHit: number;
  fixtureGroundingDiagnostics: FixtureGroundingDiagnostic[];
  weightConfig: WeightConfigSnapshotMetadata;
}

export function buildFixtureGroundingDiagnostic(
  fixtureId: number,
  prefetch: ProductionCombinedGroundingPrefetchResult
): FixtureGroundingDiagnostic {
  return {
    fixtureId,
    combinedGroundingRequestId: prefetch.combinedGroundingRequestId,
    combinedGroundingLiveRequest: prefetch.combinedGroundingLiveRequest,
    squadAvailability: prefetch.squadGrounding,
    matchContext: prefetch.matchContextGrounding,
  };
}

export function buildDailyAnalysisObservabilityDiagnostics(input: {
  weightConfig: WeightConfigSnapshotMetadata;
  fixtureGroundingDiagnostics?: FixtureGroundingDiagnostic[];
}): DailyAnalysisObservabilityDiagnostics {
  const grounding = getGroundingRuntimeMetricsSnapshot();
  const budget = getGroundingRequestBudgetSnapshot();
  const profile = getProfileCacheMetricsSnapshot();
  const plan = getPlanCapabilityMetricsSnapshot();

  return {
    groundingConfigured: grounding.groundingConfigured,
    groundingCalled: budget.groundingRequestsUsed,
    groundingSucceeded: grounding.groundingSucceeded,
    groundingCacheHit: grounding.groundingCacheHit,
    groundingFailureReason: grounding.groundingFailureReason,
    groundingSearchCount: budget.combinedGroundingRequestCount,
    groundingHttpStatus: grounding.groundingHttpStatus,
    groundingModel: grounding.groundingModel,
    groundingCandidateCount: grounding.groundingCandidateCount,
    groundingSafetyBlockedCount: grounding.groundingSafetyBlockedCount,
    groundingParseFailureCount: grounding.groundingParseFailureCount,
    groundingFallbackUsed: grounding.groundingFallbackUsed,
    groundingRequestBudget: budget.groundingRequestBudget,
    groundingRequestsUsed: budget.groundingRequestsUsed,
    groundingRequestsAvoidedByCache: budget.groundingRequestsAvoidedByCache,
    groundingRequestsAvoidedByBudget: budget.groundingRequestsAvoidedByBudget,
    groundingRateLimitTriggered: budget.groundingRateLimitTriggered,
    groundingCooldownActive: budget.groundingCooldownActive,
    groundingDeferredCount: budget.groundingDeferredCount,
    combinedGroundingRequestCount: budget.combinedGroundingRequestCount,
    profileCacheHit: profile.profileCacheHit,
    profileCacheMiss: profile.profileCacheMiss,
    uniqueTeamsRequested: profile.uniqueTeamsRequested,
    duplicateTeamRequestsAvoided: profile.duplicateTeamRequestsAvoided,
    profileRequestsAvoidedByQuota: profile.profileRequestsAvoidedByQuota,
    deferredProfileRetried: profile.deferredProfileRetried,
    deferredProfileCompleted: profile.deferredProfileCompleted,
    planRestrictedRequestsAvoided: plan.planRestrictedRequestsAvoided,
    effectiveProfileSeason: plan.effectiveProfileSeason,
    capabilityCacheHit: plan.capabilityCacheHit,
    fixtureGroundingDiagnostics: input.fixtureGroundingDiagnostics ?? [],
    weightConfig: input.weightConfig,
  };
}

export function observabilityDiagnosticsToExecutionContext(
  diagnostics: DailyAnalysisObservabilityDiagnostics
): Record<string, unknown> {
  return {
    ...diagnostics,
    diagnostics,
  };
}

export type { ProfileCacheMetricsSnapshot };
