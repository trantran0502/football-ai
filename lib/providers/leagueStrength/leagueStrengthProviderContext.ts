import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { ProductionLeagueStrengthRequest } from "@/lib/providers/leagueStrength/leagueStrengthTypes";

export interface ProductionLeagueStrengthContext extends ProductionLeagueStrengthRequest {
  matchRecords?: HistoricalMatchRecord[];
  loadMatchRecords?: () => HistoricalMatchRecord[] | Promise<HistoricalMatchRecord[]>;
}

let activeContext: ProductionLeagueStrengthContext | null = null;

export function setActiveProductionLeagueStrengthContext(
  context: ProductionLeagueStrengthContext | null
): void {
  activeContext = context ? { ...context } : null;
}

export function getActiveProductionLeagueStrengthContext(): ProductionLeagueStrengthContext | null {
  return activeContext ? { ...activeContext } : null;
}

export function clearActiveProductionLeagueStrengthContext(): void {
  activeContext = null;
}
