import type {
  ProductionSquadAvailabilityRequest,
  ProductionSquadAvailabilityResolution,
} from "@/lib/providers/squadAvailability/squadAvailabilityTypes";
import { buildSquadAvailabilityCacheKey } from "@/lib/providers/squadAvailability/squadAvailabilityTypes";

const resolutionStore = new Map<string, ProductionSquadAvailabilityResolution>();

export function readProductionSquadAvailabilityResolution(
  request: ProductionSquadAvailabilityRequest
): ProductionSquadAvailabilityResolution | null {
  return resolutionStore.get(buildSquadAvailabilityCacheKey(request)) ?? null;
}

export function rememberProductionSquadAvailabilityResolution(
  request: ProductionSquadAvailabilityRequest,
  resolution: ProductionSquadAvailabilityResolution
): void {
  resolutionStore.set(buildSquadAvailabilityCacheKey(request), resolution);
}

export function clearProductionSquadAvailabilityCacheForTests(): void {
  resolutionStore.clear();
}
