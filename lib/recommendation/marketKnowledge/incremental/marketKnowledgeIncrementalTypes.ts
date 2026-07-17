import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { MarketKnowledgeSnapshot } from "../marketKnowledgeTypes";
import type { MarketKnowledgeRepository } from "../persistence/marketKnowledgeRepository";
import type { MarketKnowledgeIncrementalReport } from "./marketKnowledgeIncrementalReport";

export interface UpdateMarketKnowledgeIncrementallyOptions {
  latestSnapshot: MarketKnowledgeSnapshot | null;
  verifiedMatch: HistoricalMatchRecord;
  repository?: MarketKnowledgeRepository;
  snapshotId?: string;
  generatedAt?: string;
  dryRun?: boolean;
}

export interface UpdateMarketKnowledgeIncrementallyResult {
  snapshot: MarketKnowledgeSnapshot;
  report: MarketKnowledgeIncrementalReport;
  skipped: boolean;
  skipReason?: string;
}

export class MarketKnowledgeIncrementalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketKnowledgeIncrementalValidationError";
  }
}
