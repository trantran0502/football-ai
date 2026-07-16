import type { SquadAvailabilityProviderRequest } from "@/lib/analysis/featureScore/providers/squadAvailabilityProvider";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { fetchGoogleLiveResult } from "@/lib/providers/googleSearch/googleSearchService";
import {
  isSquadAvailabilitySampleUsable,
} from "@/lib/providers/squadAvailability/squadAvailabilityConfidence";
import {
  readProductionSquadAvailabilityResolution,
  rememberProductionSquadAvailabilityResolution,
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

  if (!expectedSource || expectedSource === "googleSearch") {
    const fromGoogle = resolveSquadAvailabilityFromGoogleSearch({
      request,
      referenceDate: request.matchDate,
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

export async function prefetchProductionSquadAvailability(
  context: ProductionSquadAvailabilityContext
): Promise<ProductionSquadAvailabilityResolution | null> {
  const request: SquadAvailabilityProviderRequest = {
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    matchDate: context.matchDate,
  };
  const productionRequest: ProductionSquadAvailabilityRequest = {
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    matchDate: context.matchDate,
  };

  const existing = readProductionSquadAvailabilityResolution(productionRequest);
  if (existing) {
    return {
      ...existing,
      diagnostics: { ...existing.diagnostics, cacheHit: true },
    };
  }

  setActiveProductionSquadAvailabilityContext(context);
  try {
    await fetchGoogleLiveResult({
      homeTeam: context.homeTeam,
      awayTeam: context.awayTeam,
      matchDate: context.matchDate,
    });

    const fromGoogle = resolveSquadAvailabilityFromGoogleSearch({
      request,
      referenceDate: context.matchDate,
    });
    if (fromGoogle) {
      rememberProductionSquadAvailabilityResolution(productionRequest, fromGoogle);
      return fromGoogle;
    }

    const records = context.matchRecords ?? [];
    const fromRecords = resolveSquadAvailabilityFromMatchRecords({
      request,
      records,
      referenceDate: context.matchDate,
    });
    if (fromRecords) {
      rememberProductionSquadAvailabilityResolution(productionRequest, fromRecords);
      return fromRecords;
    }

    return null;
  } finally {
    clearActiveProductionSquadAvailabilityContext();
  }
}

export function getProductionSquadAvailabilityResolution(
  request: SquadAvailabilityProviderRequest
): ProductionSquadAvailabilityResolution | null {
  const cached = readCachedProductionSquadAvailability(request);
  if (cached) {
    return cached;
  }

  const fromGoogle = resolveSquadAvailabilityFromGoogleSearch({
    request,
    referenceDate: request.matchDate,
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
