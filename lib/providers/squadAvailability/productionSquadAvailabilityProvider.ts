import type { SquadAvailabilityProviderRequest } from "@/lib/analysis/featureScore/providers/squadAvailabilityProvider";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { GroundingChannelDiagnostic } from "@/lib/providers/googleSearch/googleSearchService";
import {
  isSquadAvailabilitySampleUsable,
} from "@/lib/providers/squadAvailability/squadAvailabilityConfidence";
import {
  readProductionSquadAvailabilityResolution,
} from "@/lib/providers/squadAvailability/squadAvailabilityCache";
import { resolveSquadAvailabilityFromGoogleSearch } from "@/lib/providers/squadAvailability/squadAvailabilityGoogleSource";
import { resolveSquadAvailabilityFromMatchRecords } from "@/lib/providers/squadAvailability/squadAvailabilityMatchRecordsSource";
import {
  clearActiveProductionSquadAvailabilityContext,
  getActiveProductionSquadAvailabilityContext,
  setActiveProductionSquadAvailabilityContext,
  type ProductionSquadAvailabilityContext,
} from "@/lib/providers/squadAvailability/squadAvailabilityProviderContext";
import {
  createEmptySquadAvailabilityDiagnostics,
  type ProductionSquadAvailabilityRequest,
  type ProductionSquadAvailabilityResolution,
} from "@/lib/providers/squadAvailability/squadAvailabilityTypes";
import type { ProviderDataByKey } from "@/lib/providers/registry/types";
import { isProductionRecommendationMode } from "@/lib/providers/teamProfile/providerMode";

export function usesProductionSquadAvailabilityOnlyPath(): boolean {
  return isProductionRecommendationMode();
}

function toProductionRequest(
  request: SquadAvailabilityProviderRequest
): ProductionSquadAvailabilityRequest {
  const context = getActiveProductionSquadAvailabilityContext();
  return {
    homeTeam: request.homeTeam,
    awayTeam: request.awayTeam,
    matchDate: context?.matchDate ?? request.matchDate,
    fixtureId: context?.fixtureId,
    kickoffTime: context?.kickoffTime,
  };
}

export function readCachedProductionSquadAvailability(
  request: SquadAvailabilityProviderRequest
): ProductionSquadAvailabilityResolution | null {
  const cached = readProductionSquadAvailabilityResolution(toProductionRequest(request));
  if (!cached) {
    return null;
  }
  return {
    ...cached,
    diagnostics: {
      ...cached.diagnostics,
      cacheHit: true,
    },
  };
}

function resolveFromContextMatchRecords(
  request: SquadAvailabilityProviderRequest
): ProductionSquadAvailabilityResolution | null {
  const context = getActiveProductionSquadAvailabilityContext();
  const records = context?.matchRecords;
  if (!records || records.length === 0) {
    return null;
  }

  return resolveSquadAvailabilityFromMatchRecords({
    request,
    records,
    referenceDate: context.matchDate ?? request.matchDate,
  });
}

export function fetchProductionSquadAvailabilitySourceData(
  request: SquadAvailabilityProviderRequest,
  expectedSource?: "googleSearch" | "matchRecords"
): ProviderDataByKey["squadAvailability"] | null {
  const cached = readCachedProductionSquadAvailability(request);
  if (cached && isSquadAvailabilitySampleUsable(cached.snapshot.sampleSize)) {
    if (!expectedSource || cached.source === expectedSource) {
      return cached.snapshot;
    }
  }

  const context = getActiveProductionSquadAvailabilityContext();
  if (!expectedSource || expectedSource === "googleSearch") {
    const fromGoogle = resolveSquadAvailabilityFromGoogleSearch({
      request,
      referenceDate: request.matchDate,
      fixtureId: context?.fixtureId,
      kickoffTime: context?.kickoffTime,
    });
    if (fromGoogle && isSquadAvailabilitySampleUsable(fromGoogle.snapshot.sampleSize)) {
      return fromGoogle.snapshot;
    }
  }

  if (!expectedSource || expectedSource === "matchRecords") {
    const fromRecords = resolveFromContextMatchRecords(request);
    if (fromRecords && isSquadAvailabilitySampleUsable(fromRecords.snapshot.sampleSize)) {
      return fromRecords.snapshot;
    }
  }

  return null;
}

export type GroundingPrefetchOutcome = GroundingChannelDiagnostic;

export async function prefetchProductionSquadAvailability(
  context: ProductionSquadAvailabilityContext
): Promise<{
  resolution: ProductionSquadAvailabilityResolution | null;
  grounding: GroundingPrefetchOutcome;
}> {
  const productionRequest = {
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    matchDate: context.matchDate,
    fixtureId: context.fixtureId,
    kickoffTime: context.kickoffTime,
  };
  const resolution = readProductionSquadAvailabilityResolution(productionRequest);
  const grounding: GroundingPrefetchOutcome = resolution
    ? {
        called: false,
        cacheHit: true,
        skippedReason: "legacy_prefetch_disabled_use_combined",
        succeeded: true,
        failureReason: null,
        httpStatus: null,
        model: null,
        candidateCount: 0,
        parseFailureReason: null,
        groundingFallbackUsed: false,
        hasResponseText: false,
        hasGroundingMetadata: false,
      }
    : {
        called: false,
        cacheHit: false,
        skippedReason: "legacy_prefetch_disabled_use_combined",
        succeeded: false,
        failureReason: "legacy_prefetch_disabled_use_combined",
        httpStatus: null,
        model: null,
        candidateCount: 0,
        parseFailureReason: null,
        groundingFallbackUsed: false,
        hasResponseText: false,
        hasGroundingMetadata: false,
      };

  return {
    resolution,
    grounding,
  };
}

export function getProductionSquadAvailabilityResolution(
  request: SquadAvailabilityProviderRequest
): ProductionSquadAvailabilityResolution | null {
  const cached = readCachedProductionSquadAvailability(request);
  if (cached) {
    return cached;
  }

  const context = getActiveProductionSquadAvailabilityContext();
  const fromGoogle = resolveSquadAvailabilityFromGoogleSearch({
    request,
    referenceDate: request.matchDate,
    fixtureId: context?.fixtureId,
    kickoffTime: context?.kickoffTime,
  });
  if (fromGoogle) {
    return fromGoogle;
  }

  return resolveFromContextMatchRecords(request);
}

export function prepareProductionSquadAvailabilityContext(
  context: ProductionSquadAvailabilityContext | null | undefined
): void {
  setActiveProductionSquadAvailabilityContext(context ?? null);
}

export function resetProductionSquadAvailabilityContext(): void {
  clearActiveProductionSquadAvailabilityContext();
}

export type {
  HistoricalMatchRecord,
  ProductionSquadAvailabilityContext,
  ProductionSquadAvailabilityResolution,
};
