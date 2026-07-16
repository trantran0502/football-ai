import type { H2HMatchRecord, H2HSnapshot } from "@/lib/analysis/featureScore/providers/h2hProvider";
import type { ProviderDataSource } from "@/lib/providers/registry/types";

export interface H2HProviderDiagnostics {
  source: ProviderDataSource | "unavailable";
  sampleSize: number;
  requestUrl: string | null;
  rawCount: number;
  normalizedCount: number;
  filteredFriendlyCount: number;
  filteredIncompleteCount: number;
  filteredStatusCount: number;
  quotaSkipped: boolean;
  cacheHit: boolean;
  warnings: string[];
}

export interface ProductionH2HRequest {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
  homeTeamId?: number | null;
  awayTeamId?: number | null;
}

export interface ProductionH2HResolution {
  snapshot: H2HSnapshot;
  source: Exclude<ProviderDataSource, "cache">;
  confidence: number;
  diagnostics: H2HProviderDiagnostics;
}

export function createEmptyH2HDiagnostics(
  source: ProviderDataSource | "unavailable" = "unavailable"
): H2HProviderDiagnostics {
  return {
    source,
    sampleSize: 0,
    requestUrl: null,
    rawCount: 0,
    normalizedCount: 0,
    filteredFriendlyCount: 0,
    filteredIncompleteCount: 0,
    filteredStatusCount: 0,
    quotaSkipped: false,
    cacheHit: false,
    warnings: [],
  };
}

export function buildH2HCacheKey(request: ProductionH2HRequest): string {
  const matchDate = request.matchDate ?? "";
  return `${request.homeTeam.trim().toLowerCase()}|${request.awayTeam.trim().toLowerCase()}|${matchDate}`;
}

export function buildH2HApiRequestUrl(homeTeamId: number, awayTeamId: number): string {
  return `/fixtures?h2h=${homeTeamId}-${awayTeamId}&last=10`;
}

export type { H2HMatchRecord, H2HSnapshot };
