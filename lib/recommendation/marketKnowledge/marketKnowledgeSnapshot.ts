import {
  buildLeagueStatistics,
  buildMarketStatistics,
  buildPatternStatistics,
  buildRuleStatistics,
} from "./marketKnowledgeBuilder";
import {
  createPlaceholderKnowledgeSnapshot,
  saveSnapshot,
} from "./marketKnowledgeStore";
import {
  createEmptyMarketStatisticsMap,
  type MarketKnowledgeSnapshot,
} from "./marketKnowledgeTypes";

export const MARKET_KNOWLEDGE_SNAPSHOT_VERSION = "1.0.0";

export interface BuildMarketKnowledgeSnapshotOptions {
  id?: string;
  generatedAt?: string;
}

export function buildMarketKnowledgeSnapshot(
  options: BuildMarketKnowledgeSnapshotOptions = {}
): MarketKnowledgeSnapshot {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const snapshot = createPlaceholderKnowledgeSnapshot(generatedAt);

  if (options.id) {
    snapshot.id = options.id;
  }

  snapshot.version = MARKET_KNOWLEDGE_SNAPSHOT_VERSION;

  buildRuleStatistics();
  buildPatternStatistics();
  buildLeagueStatistics();
  buildMarketStatistics();

  return snapshot;
}

export function buildAndSaveMarketKnowledgeSnapshot(
  options: BuildMarketKnowledgeSnapshotOptions = {}
): MarketKnowledgeSnapshot {
  const snapshot = buildMarketKnowledgeSnapshot(options);
  return saveSnapshot(snapshot);
}

export function attachKnowledgeSnapshotId(
  analysisSnapshot: {
    knowledgeSnapshotId?: string | null;
  },
  knowledgeSnapshot: MarketKnowledgeSnapshot
): string {
  analysisSnapshot.knowledgeSnapshotId = knowledgeSnapshot.id;
  return knowledgeSnapshot.id;
}

export function createKnowledgeSnapshotReference(
  knowledgeSnapshotId: string | null = null
): { knowledgeSnapshotId: string | null } {
  return { knowledgeSnapshotId };
}

export { createEmptyMarketStatisticsMap };
