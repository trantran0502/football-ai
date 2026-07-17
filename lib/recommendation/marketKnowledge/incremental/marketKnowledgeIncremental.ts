import { randomUUID } from "crypto";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { evaluateVerifiedMatchForKnowledge } from "../marketKnowledgeAccumulator";
import { MARKET_KNOWLEDGE_SNAPSHOT_VERSION } from "../marketKnowledgeSnapshot";
import { incrementMarketKnowledgeSnapshotFromObservations } from "../marketKnowledgeStatistics";
import {
  createEmptyMarketKnowledgeSnapshot,
  type MarketKnowledgeSnapshot,
} from "../marketKnowledgeTypes";
import { createDefaultSnapshotMetadata } from "../persistence/marketKnowledgeVersioning";
import { buildIncrementalReport } from "./marketKnowledgeIncrementalReport";
import { validateIncrementalUpdate } from "./marketKnowledgeIncrementalValidator";
import type {
  UpdateMarketKnowledgeIncrementallyOptions,
  UpdateMarketKnowledgeIncrementallyResult,
} from "./marketKnowledgeIncrementalTypes";

function createBaselineSnapshot(generatedAt: string): MarketKnowledgeSnapshot {
  const snapshot = createEmptyMarketKnowledgeSnapshot(randomUUID(), generatedAt);
  snapshot.status = "available";
  snapshot.message = undefined;
  snapshot.version = MARKET_KNOWLEDGE_SNAPSHOT_VERSION;
  return snapshot;
}

function resolveGeneratedAt(record: HistoricalMatchRecord): string {
  return record.verificationResult?.verifiedAt ?? record.updatedAt ?? record.createdAt;
}

export function updateMarketKnowledgeIncrementally(
  options: UpdateMarketKnowledgeIncrementallyOptions
): UpdateMarketKnowledgeIncrementallyResult {
  const startedAt = Date.now();
  const dryRun = options.dryRun ?? false;
  const evaluation = evaluateVerifiedMatchForKnowledge(options.verifiedMatch);

  if (evaluation.skippedReason) {
    return {
      snapshot: options.latestSnapshot ?? createBaselineSnapshot(new Date().toISOString()),
      report: {
        updatedRules: [],
        updatedPatterns: [],
        updatedMarkets: [],
        updatedLeagues: [],
        processingTimeMs: Date.now() - startedAt,
        newSnapshotId: options.latestSnapshot?.id ?? "",
        parentSnapshotId: options.latestSnapshot?.id ?? null,
      },
      skipped: true,
      skipReason: evaluation.skippedReason,
    };
  }

  const generatedAt = options.generatedAt ?? resolveGeneratedAt(options.verifiedMatch);
  const baseSnapshot =
    options.latestSnapshot ?? createBaselineSnapshot(generatedAt);
  const previousMatchCount = options.latestSnapshot?.metadata?.matchCount ?? 0;
  const firstMatchId =
    options.latestSnapshot?.metadata?.firstMatchId ?? options.verifiedMatch.id;
  const parentSnapshotId = options.latestSnapshot?.id ?? null;

  const nextSnapshot = incrementMarketKnowledgeSnapshotFromObservations(
    baseSnapshot,
    evaluation.observations,
    {
      snapshotId: options.snapshotId ?? randomUUID(),
      generatedAt,
      version: MARKET_KNOWLEDGE_SNAPSHOT_VERSION,
    }
  );

  nextSnapshot.version = MARKET_KNOWLEDGE_SNAPSHOT_VERSION;

  const snapshotMetadata = createDefaultSnapshotMetadata({
    source: "INCREMENTAL",
    matchCount: previousMatchCount + 1,
    firstMatchId,
    lastMatchId: options.verifiedMatch.id,
    parentSnapshotId,
    engineVersion: MARKET_KNOWLEDGE_SNAPSHOT_VERSION,
  });
  nextSnapshot.metadata = snapshotMetadata;

  const report = buildIncrementalReport({
    previousSnapshot: options.latestSnapshot,
    nextSnapshot,
    processingTimeMs: Date.now() - startedAt,
  });

  validateIncrementalUpdate({
    previousSnapshot: options.latestSnapshot,
    nextSnapshot,
    observations: evaluation.observations,
    report,
  });

  if (!dryRun && options.repository) {
    options.repository.saveSnapshot(nextSnapshot, {
      metadata: snapshotMetadata,
    });
  }

  return {
    snapshot: nextSnapshot,
    report,
    skipped: false,
  };
}

export {
  createBaselineSnapshot,
  resolveGeneratedAt,
};
