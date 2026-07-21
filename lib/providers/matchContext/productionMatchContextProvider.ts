import type { MatchContextProviderRequest } from "@/lib/analysis/featureScore/providers/matchContextProvider";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { GroundingChannelDiagnostic } from "@/lib/providers/googleSearch/googleSearchService";
import { isMatchContextSampleUsable } from "@/lib/providers/matchContext/matchContextConfidence";
import {
  readProductionMatchContextResolution,
} from "@/lib/providers/matchContext/matchContextCache";
import { resolveMatchContextFromGoogleSearch } from "@/lib/providers/matchContext/matchContextGoogleSource";
import { resolveMatchContextFromMatchRecords } from "@/lib/providers/matchContext/matchContextMatchRecordsSource";
import {
  clearActiveProductionMatchContextContext,
  getActiveProductionMatchContextContext,
  setActiveProductionMatchContextContext,
  type ProductionMatchContextContext,
} from "@/lib/providers/matchContext/matchContextProviderContext";
import type {
  ProductionMatchContextRequest,
  ProductionMatchContextResolution,
} from "@/lib/providers/matchContext/matchContextTypes";
import type { ProviderDataByKey } from "@/lib/providers/registry/types";
import { isProductionRecommendationMode, isGoogleGroundingEnabled } from "@/lib/providers/teamProfile/providerMode";

export function usesProductionMatchContextOnlyPath(): boolean {
  return isProductionRecommendationMode();
}

function toProductionRequest(
  request: MatchContextProviderRequest
): ProductionMatchContextRequest {
  const context = getActiveProductionMatchContextContext();
  return {
    homeTeam: request.homeTeam,
    awayTeam: request.awayTeam,
    matchDate: context?.matchDate ?? request.matchDate,
    fixtureId: context?.fixtureId,
    kickoffTime: context?.kickoffTime,
  };
}

export function readCachedProductionMatchContext(
  request: MatchContextProviderRequest
): ProductionMatchContextResolution | null {
  const cached = readProductionMatchContextResolution(toProductionRequest(request));
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
  request: MatchContextProviderRequest
): ProductionMatchContextResolution | null {
  const context = getActiveProductionMatchContextContext();
  const records = context?.matchRecords;
  if (!records || records.length === 0) {
    return null;
  }

  return resolveMatchContextFromMatchRecords({
    request,
    records,
    referenceDate: context.matchDate ?? request.matchDate,
  });
}

export function fetchProductionMatchContextSourceData(
  request: MatchContextProviderRequest,
  expectedSource?: "googleSearch" | "matchRecords"
): ProviderDataByKey["matchContext"] | null {
  const cached = readCachedProductionMatchContext(request);
  if (cached && isMatchContextSampleUsable(cached.snapshot.sampleSize)) {
    if (!expectedSource || cached.source === expectedSource) {
      return cached.snapshot;
    }
  }

  const context = getActiveProductionMatchContextContext();
  if (isGoogleGroundingEnabled() && (!expectedSource || expectedSource === "googleSearch")) {
    const fromGoogle = resolveMatchContextFromGoogleSearch({
      request,
      referenceDate: request.matchDate,
      fixtureId: context?.fixtureId,
      kickoffTime: context?.kickoffTime,
    });
    if (fromGoogle && isMatchContextSampleUsable(fromGoogle.snapshot.sampleSize)) {
      return fromGoogle.snapshot;
    }
  }

  if (!expectedSource || expectedSource === "matchRecords") {
    const fromRecords = resolveFromContextMatchRecords(request);
    if (fromRecords && isMatchContextSampleUsable(fromRecords.snapshot.sampleSize)) {
      return fromRecords.snapshot;
    }
  }

  return null;
}

export type GroundingPrefetchOutcome = GroundingChannelDiagnostic;

export async function prefetchProductionMatchContext(
  context: ProductionMatchContextContext
): Promise<{
  resolution: ProductionMatchContextResolution | null;
  grounding: GroundingPrefetchOutcome;
}> {
  const productionRequest = {
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    matchDate: context.matchDate,
    fixtureId: context.fixtureId,
    kickoffTime: context.kickoffTime,
  };
  const resolution = readProductionMatchContextResolution(productionRequest);
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

export function getProductionMatchContextResolution(
  request: MatchContextProviderRequest
): ProductionMatchContextResolution | null {
  const cached = readCachedProductionMatchContext(request);
  if (cached) {
    return cached;
  }

  const context = getActiveProductionMatchContextContext();
  if (isGoogleGroundingEnabled()) {
    const fromGoogle = resolveMatchContextFromGoogleSearch({
      request,
      referenceDate: request.matchDate,
      fixtureId: context?.fixtureId,
      kickoffTime: context?.kickoffTime,
    });
    if (fromGoogle) {
      return fromGoogle;
    }
  }

  return resolveFromContextMatchRecords(request);
}

export function prepareProductionMatchContextContext(
  context: ProductionMatchContextContext | null | undefined
): void {
  setActiveProductionMatchContextContext(context ?? null);
}

export function resetProductionMatchContextContext(): void {
  clearActiveProductionMatchContextContext();
}

export type {
  HistoricalMatchRecord,
  ProductionMatchContextContext,
  ProductionMatchContextResolution,
};
