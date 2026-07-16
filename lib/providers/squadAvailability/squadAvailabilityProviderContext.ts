import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { ProductionSquadAvailabilityRequest } from "@/lib/providers/squadAvailability/squadAvailabilityTypes";

export interface ProductionSquadAvailabilityContext extends ProductionSquadAvailabilityRequest {
  matchRecords?: HistoricalMatchRecord[];
  loadMatchRecords?: () => HistoricalMatchRecord[] | Promise<HistoricalMatchRecord[]>;
}

let activeContext: ProductionSquadAvailabilityContext | null = null;

export function setActiveProductionSquadAvailabilityContext(
  context: ProductionSquadAvailabilityContext | null
): void {
  activeContext = context ? { ...context } : null;
}

export function getActiveProductionSquadAvailabilityContext(): ProductionSquadAvailabilityContext | null {
  return activeContext ? { ...activeContext } : null;
}

export function clearActiveProductionSquadAvailabilityContext(): void {
  activeContext = null;
}
