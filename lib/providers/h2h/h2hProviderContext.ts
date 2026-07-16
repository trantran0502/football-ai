import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { ProductionH2HRequest } from "@/lib/providers/h2h/h2hTypes";

export interface ProductionH2HContext extends ProductionH2HRequest {
  matchRecords?: HistoricalMatchRecord[];
  loadMatchRecords?: () => HistoricalMatchRecord[] | Promise<HistoricalMatchRecord[]>;
}

let activeContext: ProductionH2HContext | null = null;

export function setActiveProductionH2HContext(
  context: ProductionH2HContext | null
): void {
  activeContext = context ? { ...context } : null;
}

export function getActiveProductionH2HContext(): ProductionH2HContext | null {
  return activeContext ? { ...activeContext } : null;
}

export function clearActiveProductionH2HContext(): void {
  activeContext = null;
}
