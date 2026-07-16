import type { SquadAvailabilitySnapshot } from "@/lib/analysis/featureScore/providers/squadAvailabilityProvider";
import type { ProviderDataSource } from "@/lib/providers/registry/types";

export interface SquadAvailabilityProviderDiagnostics {
  source: ProviderDataSource | "unavailable";
  sampleSize: number;
  dataFreshnessDays: number | null;
  officialRecordCount: number;
  filteredUnofficialCount: number;
  filteredUnconfirmedCount: number;
  cacheHit: boolean;
  warnings: string[];
}

export interface ProductionSquadAvailabilityRequest {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
}

export interface ProductionSquadAvailabilityResolution {
  snapshot: SquadAvailabilitySnapshot;
  source: Exclude<ProviderDataSource, "cache">;
  confidence: number;
  diagnostics: SquadAvailabilityProviderDiagnostics;
}

export function createEmptySquadAvailabilityDiagnostics(
  source: ProviderDataSource | "unavailable" = "unavailable"
): SquadAvailabilityProviderDiagnostics {
  return {
    source,
    sampleSize: 0,
    dataFreshnessDays: null,
    officialRecordCount: 0,
    filteredUnofficialCount: 0,
    filteredUnconfirmedCount: 0,
    cacheHit: false,
    warnings: [],
  };
}

export function buildSquadAvailabilityCacheKey(
  request: ProductionSquadAvailabilityRequest
): string {
  return `${request.homeTeam.trim().toLowerCase()}|${request.awayTeam.trim().toLowerCase()}|${request.matchDate ?? ""}`;
}
