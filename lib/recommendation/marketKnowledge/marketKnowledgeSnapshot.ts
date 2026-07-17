import { randomUUID } from "crypto";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { buildMarketKnowledgeFromVerifiedMatches } from "./marketKnowledgeFromVerified";
import {
  createPlaceholderKnowledgeSnapshot,
  saveSnapshot,
} from "./marketKnowledgeStore";
import {
  createEmptyMarketStatisticsMap,
  type MarketKnowledgeSnapshot,
} from "./marketKnowledgeTypes";

export const MARKET_KNOWLEDGE_SNAPSHOT_VERSION = "1.1.0";

export interface BuildMarketKnowledgeSnapshotOptions {
  id?: string;
  generatedAt?: string;
  verifiedMatches?: HistoricalMatchRecord[];
}

export function buildMarketKnowledgeSnapshot(
  options: BuildMarketKnowledgeSnapshotOptions = {}
): MarketKnowledgeSnapshot {
  if (options.verifiedMatches && options.verifiedMatches.length > 0) {
    return buildMarketKnowledgeFromVerifiedMatches(options.verifiedMatches, {
      snapshotId: options.id,
      generatedAt: options.generatedAt,
    });
  }

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const snapshot = createPlaceholderKnowledgeSnapshot(generatedAt);

  if (options.id) {
    snapshot.id = options.id;
  }

  snapshot.version = MARKET_KNOWLEDGE_SNAPSHOT_VERSION;
  return snapshot;
}

export function buildAndSaveMarketKnowledgeSnapshot(
  options: BuildMarketKnowledgeSnapshotOptions = {}
): MarketKnowledgeSnapshot {
  const snapshot = options.verifiedMatches?.length
    ? buildMarketKnowledgeFromVerifiedMatches(options.verifiedMatches, {
        snapshotId: options.id ?? randomUUID(),
        generatedAt: options.generatedAt,
      })
    : buildMarketKnowledgeSnapshot(options);
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
