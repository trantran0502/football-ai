import type { LeagueStrengthSnapshot } from "@/lib/analysis/featureScore/providers/leagueStrengthProvider";
import type { ProviderDataSource } from "@/lib/providers/registry/types";

export interface LeagueStrengthProviderDiagnostics {
  source: ProviderDataSource | "unavailable";
  sampleSize: number;
  rawCount: number;
  normalizedCount: number;
  filteredFriendlyCount: number;
  filteredIncompleteCount: number;
  filteredStatusCount: number;
  filteredLeagueMismatchCount: number;
  cacheHit: boolean;
  warnings: string[];
}

export interface ProductionLeagueStrengthRequest {
  leagueName: string;
  matchDate?: string;
}

export interface ProductionLeagueStrengthResolution {
  snapshot: LeagueStrengthSnapshot;
  source: Exclude<ProviderDataSource, "cache">;
  confidence: number;
  diagnostics: LeagueStrengthProviderDiagnostics;
}

export function createEmptyLeagueStrengthDiagnostics(
  source: ProviderDataSource | "unavailable" = "unavailable"
): LeagueStrengthProviderDiagnostics {
  return {
    source,
    sampleSize: 0,
    rawCount: 0,
    normalizedCount: 0,
    filteredFriendlyCount: 0,
    filteredIncompleteCount: 0,
    filteredStatusCount: 0,
    filteredLeagueMismatchCount: 0,
    cacheHit: false,
    warnings: [],
  };
}

export function buildLeagueStrengthCacheKey(
  request: ProductionLeagueStrengthRequest
): string {
  return request.leagueName.trim().toLowerCase();
}
