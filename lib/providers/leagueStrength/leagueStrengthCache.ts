import type {
  ProductionLeagueStrengthRequest,
  ProductionLeagueStrengthResolution,
} from "@/lib/providers/leagueStrength/leagueStrengthTypes";
import { buildLeagueStrengthCacheKey } from "@/lib/providers/leagueStrength/leagueStrengthTypes";

const resolutionStore = new Map<string, ProductionLeagueStrengthResolution>();

export function readProductionLeagueStrengthResolution(
  request: ProductionLeagueStrengthRequest
): ProductionLeagueStrengthResolution | null {
  return resolutionStore.get(buildLeagueStrengthCacheKey(request)) ?? null;
}

export function rememberProductionLeagueStrengthResolution(
  request: ProductionLeagueStrengthRequest,
  resolution: ProductionLeagueStrengthResolution
): void {
  resolutionStore.set(buildLeagueStrengthCacheKey(request), resolution);
}

export function clearProductionLeagueStrengthCacheForTests(): void {
  resolutionStore.clear();
}

export function productionLeagueStrengthCacheSize(): number {
  return resolutionStore.size;
}
