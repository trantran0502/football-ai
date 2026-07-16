import type { LeagueStrengthProviderRequest } from "@/lib/analysis/featureScore/providers/leagueStrengthProvider";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  isLeagueStrengthSampleUsable,
} from "@/lib/providers/leagueStrength/leagueStrengthConfidence";
import {
  readProductionLeagueStrengthResolution,
  rememberProductionLeagueStrengthResolution,
} from "@/lib/providers/leagueStrength/leagueStrengthCache";
import {
  loadMatchRecordsForLeagueStrength,
  resolveLeagueStrengthFromMatchRecords,
} from "@/lib/providers/leagueStrength/leagueStrengthMatchRecordsSource";
import {
  clearActiveProductionLeagueStrengthContext,
  getActiveProductionLeagueStrengthContext,
  setActiveProductionLeagueStrengthContext,
  type ProductionLeagueStrengthContext,
} from "@/lib/providers/leagueStrength/leagueStrengthProviderContext";
import {
  createEmptyLeagueStrengthDiagnostics,
  type ProductionLeagueStrengthRequest,
  type ProductionLeagueStrengthResolution,
} from "@/lib/providers/leagueStrength/leagueStrengthTypes";
import type { ProviderDataByKey } from "@/lib/providers/registry/types";
import { isProductionRecommendationMode } from "@/lib/providers/teamProfile/providerMode";

export function usesProductionLeagueStrengthOnlyPath(): boolean {
  return isProductionRecommendationMode();
}

function toProductionRequest(
  request: LeagueStrengthProviderRequest
): ProductionLeagueStrengthRequest {
  const context = getActiveProductionLeagueStrengthContext();
  return {
    leagueName: request.leagueName,
    matchDate: context?.matchDate ?? request.matchDate,
  };
}

export function readCachedProductionLeagueStrength(
  request: LeagueStrengthProviderRequest
): ProductionLeagueStrengthResolution | null {
  const cached = readProductionLeagueStrengthResolution(toProductionRequest(request));
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

function resolveUsableLeagueStrengthFromContext(
  request: LeagueStrengthProviderRequest
): ProductionLeagueStrengthResolution | null {
  const context = getActiveProductionLeagueStrengthContext();
  const records = context?.matchRecords;
  if (!records || records.length === 0) {
    return null;
  }

  return resolveLeagueStrengthFromMatchRecords({
    request,
    records,
    referenceDate: context.matchDate ?? request.matchDate,
  });
}

export function fetchProductionLeagueStrengthSourceData(
  request: LeagueStrengthProviderRequest
): ProviderDataByKey["leagueStrength"] | null {
  const cached = readCachedProductionLeagueStrength(request);
  if (cached && isLeagueStrengthSampleUsable(cached.snapshot.sampleSize)) {
    return cached.snapshot;
  }

  const fromContext = resolveUsableLeagueStrengthFromContext(request);
  if (fromContext && isLeagueStrengthSampleUsable(fromContext.snapshot.sampleSize)) {
    return fromContext.snapshot;
  }

  return null;
}

export async function loadProductionLeagueStrengthMatchRecords(): Promise<
  HistoricalMatchRecord[]
> {
  try {
    const { listMatchRecordsFromSupabase } = await import(
      "@/lib/supabase/queries/matchRecords"
    );
    const loaded = await listMatchRecordsFromSupabase();
    return loaded.records;
  } catch {
    return [];
  }
}

export async function prefetchProductionLeagueStrength(
  context: ProductionLeagueStrengthContext
): Promise<ProductionLeagueStrengthResolution | null> {
  const request: LeagueStrengthProviderRequest = {
    leagueName: context.leagueName,
    matchDate: context.matchDate,
  };
  const productionRequest: ProductionLeagueStrengthRequest = {
    leagueName: context.leagueName,
    matchDate: context.matchDate,
  };

  const existing = readProductionLeagueStrengthResolution(productionRequest);
  if (existing) {
    return {
      ...existing,
      diagnostics: { ...existing.diagnostics, cacheHit: true },
    };
  }

  setActiveProductionLeagueStrengthContext(context);
  try {
    const records =
      context.matchRecords ?? (await loadMatchRecordsForLeagueStrength());
    const resolution = resolveLeagueStrengthFromMatchRecords({
      request,
      records,
      referenceDate: context.matchDate,
    });

    if (resolution) {
      rememberProductionLeagueStrengthResolution(productionRequest, resolution);
      return resolution;
    }

    return null;
  } finally {
    clearActiveProductionLeagueStrengthContext();
  }
}

export function getProductionLeagueStrengthResolution(
  request: LeagueStrengthProviderRequest
): ProductionLeagueStrengthResolution | null {
  const cached = readCachedProductionLeagueStrength(request);
  if (cached) {
    return cached;
  }

  return resolveUsableLeagueStrengthFromContext(request);
}

export function prepareProductionLeagueStrengthContext(
  context: ProductionLeagueStrengthContext | null | undefined
): void {
  setActiveProductionLeagueStrengthContext(context ?? null);
}

export function resetProductionLeagueStrengthContext(): void {
  clearActiveProductionLeagueStrengthContext();
}

export function buildUnavailableLeagueStrengthResolution(
  leagueName: string
): ProductionLeagueStrengthResolution {
  return {
    snapshot: {
      leagueName,
      leagueRanking: null,
      leagueTier: null,
      attackStrength: null,
      defenseStrength: null,
      averageGoals: null,
      averageGoalsConceded: null,
      sampleSize: 0,
      dataFreshnessDays: null,
    },
    source: "unavailable",
    confidence: 0.1,
    diagnostics: createEmptyLeagueStrengthDiagnostics("unavailable"),
  };
}

export type {
  HistoricalMatchRecord,
  ProductionLeagueStrengthContext,
  ProductionLeagueStrengthResolution,
};
