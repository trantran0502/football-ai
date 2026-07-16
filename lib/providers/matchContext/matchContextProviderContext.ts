import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";

export interface ProductionMatchContextContext {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
  matchRecords?: HistoricalMatchRecord[];
}

let activeContext: ProductionMatchContextContext | null = null;

export function setActiveProductionMatchContextContext(
  context: ProductionMatchContextContext | null
): void {
  activeContext = context;
}

export function getActiveProductionMatchContextContext(): ProductionMatchContextContext | null {
  return activeContext;
}

export function clearActiveProductionMatchContextContext(): void {
  activeContext = null;
}
