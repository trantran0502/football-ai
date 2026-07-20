import type { WeightConfigSnapshotMetadata } from "@/lib/recommendation/weightConfigTypes";
import { getGroundingRuntimeMetricsSnapshot } from "@/lib/admin/groundingRuntimeMetrics";
import { getPlanCapabilityMetricsSnapshot } from "@/lib/teamProfile/planCapabilityCache";
import {
  getProfileCacheMetricsSnapshot,
  type ProfileCacheMetricsSnapshot,
} from "@/lib/teamProfile/profileCacheMetrics";

export interface FixtureGroundingDiagnostic {
  fixtureId: number;
  squadAvailability: {
    called: boolean;
    cacheHit: boolean;
    skippedReason: string | null;
  };
  matchContext: {
    called: boolean;
    cacheHit: boolean;
    skippedReason: string | null;
  };
}

export interface DailyAnalysisObservabilityDiagnostics {
  groundingConfigured: boolean;
  groundingCalled: number;
  groundingSucceeded: number;
  groundingCacheHit: number;
  groundingFailureReason: string | null;
  groundingSearchCount: number;
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

export function buildDailyAnalysisObservabilityDiagnostics(input: {
  weightConfig: WeightConfigSnapshotMetadata;
  fixtureGroundingDiagnostics?: FixtureGroundingDiagnostic[];
}): DailyAnalysisObservabilityDiagnostics {
  const grounding = getGroundingRuntimeMetricsSnapshot();
  const profile = getProfileCacheMetricsSnapshot();
  const plan = getPlanCapabilityMetricsSnapshot();

  return {
    groundingConfigured: grounding.groundingConfigured,
    groundingCalled: grounding.groundingCalled,
    groundingSucceeded: grounding.groundingSucceeded,
    groundingCacheHit: grounding.groundingCacheHit,
    groundingFailureReason: grounding.groundingFailureReason,
    groundingSearchCount: grounding.groundingSearchCount,
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
