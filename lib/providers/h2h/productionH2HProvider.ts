import type { H2HProviderRequest } from "@/lib/analysis/featureScore/providers/h2hProvider";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { resolveH2HFromApiFootball } from "@/lib/providers/h2h/h2hApiFootballSource";
import {
  readProductionH2HResolution,
  rememberProductionH2HResolution,
} from "@/lib/providers/h2h/h2hCache";
import {
  loadMatchRecordsForH2H,
  resolveH2HFromMatchRecords,
} from "@/lib/providers/h2h/h2hMatchRecordsSource";
import {
  clearActiveProductionH2HContext,
  getActiveProductionH2HContext,
  setActiveProductionH2HContext,
  type ProductionH2HContext,
} from "@/lib/providers/h2h/h2hProviderContext";
import {
  createEmptyH2HDiagnostics,
  type ProductionH2HRequest,
  type ProductionH2HResolution,
} from "@/lib/providers/h2h/h2hTypes";
import type { ProviderDataByKey } from "@/lib/providers/registry/types";

function toProductionRequest(request: H2HProviderRequest): ProductionH2HRequest {
  const context = getActiveProductionH2HContext();
  return {
    homeTeam: request.homeTeam,
    awayTeam: request.awayTeam,
    matchDate: request.matchDate,
    homeTeamId: context?.homeTeamId ?? null,
    awayTeamId: context?.awayTeamId ?? null,
  };
}

function attachDiagnosticsToSnapshot(
  resolution: ProductionH2HResolution
): ProductionH2HResolution {
  return {
    ...resolution,
    snapshot: {
      ...resolution.snapshot,
      diagnostics: resolution.diagnostics as unknown as Record<string, unknown>,
    },
  };
}

export function readCachedProductionH2H(
  request: H2HProviderRequest
): ProductionH2HResolution | null {
  const cached = readProductionH2HResolution(toProductionRequest(request));
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

export function fetchProductionH2HSourceData(
  request: H2HProviderRequest,
  expectedSource?: "matchRecords" | "apiFootball"
): ProviderDataByKey["h2h"] | null {
  const cached = readCachedProductionH2H(request);
  if (!cached || cached.snapshot.sampleSize === 0) {
    return null;
  }
  if (expectedSource && cached.source !== expectedSource) {
    return null;
  }
  return cached.snapshot;
}

export async function loadProductionH2HMatchRecords(): Promise<HistoricalMatchRecord[]> {
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

export async function prefetchProductionH2H(
  context: ProductionH2HContext
): Promise<ProductionH2HResolution | null> {
  const request: H2HProviderRequest = {
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    matchDate: context.matchDate,
  };
  const productionRequest: ProductionH2HRequest = {
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    matchDate: context.matchDate,
    homeTeamId: context.homeTeamId ?? null,
    awayTeamId: context.awayTeamId ?? null,
  };

  const existing = readProductionH2HResolution(productionRequest);
  if (existing) {
    return {
      ...existing,
      diagnostics: { ...existing.diagnostics, cacheHit: true },
    };
  }

  setActiveProductionH2HContext(context);
  try {
    const records = context.matchRecords ?? (await loadMatchRecordsForH2H());
    const fromRecords = resolveH2HFromMatchRecords({ request, records });

    if (fromRecords && fromRecords.snapshot.sampleSize >= 5) {
      const resolution = attachDiagnosticsToSnapshot(fromRecords);
      rememberProductionH2HResolution(productionRequest, resolution);
      return resolution;
    }

    if (fromRecords && fromRecords.snapshot.sampleSize > 0) {
      const resolution = attachDiagnosticsToSnapshot(fromRecords);
      rememberProductionH2HResolution(productionRequest, resolution);
      return resolution;
    }

    const fromApi = await resolveH2HFromApiFootball(request, {
      homeTeamId: context.homeTeamId,
      awayTeamId: context.awayTeamId,
    });

    if (fromApi) {
      const resolution = attachDiagnosticsToSnapshot(fromApi);
      rememberProductionH2HResolution(productionRequest, resolution);
      return resolution;
    }

    return null;
  } finally {
    clearActiveProductionH2HContext();
  }
}

export function getProductionH2HResolution(
  request: H2HProviderRequest
): ProductionH2HResolution | null {
  return readCachedProductionH2H(request);
}

export function prepareProductionH2HContext(
  context: ProductionH2HContext | null | undefined
): void {
  setActiveProductionH2HContext(context ?? null);
}

export function resetProductionH2HContext(): void {
  clearActiveProductionH2HContext();
}

export function buildUnavailableH2HResolution(): ProductionH2HResolution {
  return {
    snapshot: {
      matches: [],
      sampleSize: 0,
      dataFreshnessDays: null,
      homeWinRate: null,
      awayWinRate: null,
      drawRate: null,
      averageGoals: null,
      goalDifference: null,
      bttsRate: null,
      over25Rate: null,
      venueRelevantSampleSize: null,
      venueRelevantHomeWinRate: null,
      diagnostics: createEmptyH2HDiagnostics("unavailable") as unknown as Record<
        string,
        unknown
      >,
    },
    source: "unavailable",
    confidence: 0.1,
    diagnostics: createEmptyH2HDiagnostics("unavailable"),
  };
}

export type { HistoricalMatchRecord, ProductionH2HContext, ProductionH2HResolution };
