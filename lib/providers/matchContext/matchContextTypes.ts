import type { MatchContextSnapshot } from "@/lib/analysis/featureScore/providers/matchContextProvider";
import type { ProviderDataSource } from "@/lib/providers/registry/types";

export interface MatchContextProviderDiagnostics {
  source: ProviderDataSource | "unavailable";
  sampleSize: number;
  dataFreshnessDays: number | null;
  officialCitationCount: number;
  confirmedFieldCount: number;
  cacheHit: boolean;
  warnings: string[];
}

export interface ProductionMatchContextRequest {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
  fixtureId?: number;
  kickoffTime?: string;
}

export interface ProductionMatchContextResolution {
  snapshot: MatchContextSnapshot;
  source: Exclude<ProviderDataSource, "cache">;
  confidence: number;
  diagnostics: MatchContextProviderDiagnostics;
}

export function createEmptyMatchContextDiagnostics(
  source: ProviderDataSource | "unavailable" = "unavailable"
): MatchContextProviderDiagnostics {
  return {
    source,
    sampleSize: 0,
    dataFreshnessDays: null,
    officialCitationCount: 0,
    confirmedFieldCount: 0,
    cacheHit: false,
    warnings: [],
  };
}

export function buildMatchContextCacheKey(
  request: ProductionMatchContextRequest
): string {
  return `${request.homeTeam.trim().toLowerCase()}|${request.awayTeam.trim().toLowerCase()}|${request.matchDate ?? ""}`;
}
