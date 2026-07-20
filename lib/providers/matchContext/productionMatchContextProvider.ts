import type { MatchContextProviderRequest } from "@/lib/analysis/featureScore/providers/matchContextProvider";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { fetchGoogleLiveResultWithOutcome } from "@/lib/providers/googleSearch/googleSearchService";
import { isMatchContextSampleUsable } from "@/lib/providers/matchContext/matchContextConfidence";
import {
  readProductionMatchContextResolution,
  rememberProductionMatchContextResolution,
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
import { isProductionRecommendationMode } from "@/lib/providers/teamProfile/providerMode";

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

  if (!expectedSource || expectedSource === "googleSearch") {
    const fromGoogle = resolveMatchContextFromGoogleSearch({
      request,
      referenceDate: request.matchDate,
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

export interface GroundingPrefetchOutcome {
  called: boolean;
  cacheHit: boolean;
  skippedReason: string | null;
  succeeded: boolean;
}

export async function prefetchProductionMatchContext(
  context: ProductionMatchContextContext
): Promise<{
  resolution: ProductionMatchContextResolution | null;
  grounding: GroundingPrefetchOutcome;
}> {
  const request: MatchContextProviderRequest = {
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    matchDate: context.matchDate,
  };
  const productionRequest: ProductionMatchContextRequest = {
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    matchDate: context.matchDate,
  };

  const existing = readProductionMatchContextResolution(productionRequest);
  if (existing) {
    return {
      resolution: {
        ...existing,
        diagnostics: { ...existing.diagnostics, cacheHit: true },
      },
      grounding: {
        called: false,
        cacheHit: true,
        skippedReason: "production_resolution_cache",
        succeeded: true,
      },
    };
  }

  setActiveProductionMatchContextContext(context);
  try {
    const groundingOutcome = await fetchGoogleLiveResultWithOutcome({
      homeTeam: context.homeTeam,
      awayTeam: context.awayTeam,
      matchDate: context.matchDate,
    });
    const grounding: GroundingPrefetchOutcome = {
      called: groundingOutcome.called,
      cacheHit: groundingOutcome.cacheHit,
      skippedReason: groundingOutcome.failureReason,
      succeeded: groundingOutcome.result !== null,
    };

    const fromGoogle = resolveMatchContextFromGoogleSearch({
      request,
      referenceDate: context.matchDate,
    });
    if (fromGoogle) {
      rememberProductionMatchContextResolution(productionRequest, fromGoogle);
      return { resolution: fromGoogle, grounding };
    }

    const records = context.matchRecords ?? [];
    const fromRecords = resolveMatchContextFromMatchRecords({
      request,
      records,
      referenceDate: context.matchDate,
    });
    if (fromRecords) {
      rememberProductionMatchContextResolution(productionRequest, fromRecords);
      return { resolution: fromRecords, grounding };
    }

    return { resolution: null, grounding };
  } finally {
    clearActiveProductionMatchContextContext();
  }
}

export function getProductionMatchContextResolution(
  request: MatchContextProviderRequest
): ProductionMatchContextResolution | null {
  const cached = readCachedProductionMatchContext(request);
  if (cached) {
    return cached;
  }

  const fromGoogle = resolveMatchContextFromGoogleSearch({
    request,
    referenceDate: request.matchDate,
  });
  if (fromGoogle) {
    return fromGoogle;
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
