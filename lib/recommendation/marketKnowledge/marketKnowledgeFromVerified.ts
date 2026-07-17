import { randomUUID } from "crypto";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  accumulateVerifiedMatchesForKnowledge,
  evaluateVerifiedMatchForKnowledge,
} from "./marketKnowledgeAccumulator";
import { buildStatisticsFromObservations } from "./marketKnowledgeStatistics";
import { saveSnapshot } from "./marketKnowledgeStore";
import type { MarketKnowledgeSnapshot } from "./marketKnowledgeTypes";
import { MARKET_KNOWLEDGE_SNAPSHOT_VERSION } from "./marketKnowledgeSnapshot";

export interface UpdateMarketKnowledgeResult {
  snapshot: MarketKnowledgeSnapshot;
  processedMatches: number;
  observationCount: number;
}

export function buildMarketKnowledgeFromVerifiedMatches(
  records: HistoricalMatchRecord[],
  options: { snapshotId?: string; generatedAt?: string } = {}
): MarketKnowledgeSnapshot {
  const verifiedRecords = records.filter(
    (record) => record.status === "VERIFIED" && record.result !== null
  );
  const observations = accumulateVerifiedMatchesForKnowledge(verifiedRecords);

  return buildStatisticsFromObservations(
    observations,
    options.snapshotId ?? randomUUID(),
    options.generatedAt ?? new Date().toISOString()
  );
}

export function updateMarketKnowledgeFromVerifiedMatches(
  records: HistoricalMatchRecord[],
  options: { snapshotId?: string; generatedAt?: string } = {}
): UpdateMarketKnowledgeResult {
  const snapshot = buildMarketKnowledgeFromVerifiedMatches(records, options);
  snapshot.version = MARKET_KNOWLEDGE_SNAPSHOT_VERSION;
  saveSnapshot(snapshot);

  return {
    snapshot,
    processedMatches: records.filter((record) => record.status === "VERIFIED").length,
    observationCount: accumulateVerifiedMatchesForKnowledge(
      records.filter((record) => record.status === "VERIFIED" && record.result !== null)
    ).length,
  };
}

export function traceVerifiedMatchKnowledge(record: HistoricalMatchRecord) {
  return evaluateVerifiedMatchForKnowledge(record);
}
