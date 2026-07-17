import { randomUUID } from "crypto";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { buildMarketKnowledgeFromVerifiedMatches } from "../marketKnowledgeFromVerified";
import { MARKET_KNOWLEDGE_SNAPSHOT_VERSION } from "../marketKnowledgeSnapshot";
import type { MarketKnowledgeStore } from "../marketKnowledgeStore";
import { marketKnowledgeStore } from "../marketKnowledgeStore";
import type { MarketKnowledgeSnapshot } from "../marketKnowledgeTypes";
import {
  buildReplayAuditEntry,
  buildStatisticsDiff,
  compareKnowledgeSnapshots,
  countUniqueUpdates,
  finalizeReplayReport,
} from "./marketKnowledgeReplayReport";
import type {
  ReplayMarketKnowledgeOptions,
  ReplayMarketKnowledgeResult,
  ReplayStep,
} from "./marketKnowledgeReplayTypes";
import { validateReplayResult } from "./marketKnowledgeReplay";

function resolveReplayRange(
  matches: HistoricalMatchRecord[],
  startIndex?: number,
  endIndex?: number
): { start: number; end: number; slice: HistoricalMatchRecord[] } {
  const start = startIndex ?? 0;
  const end = endIndex ?? matches.length - 1;

  if (start < 0 || end < start || start >= matches.length) {
    return { start, end, slice: [] };
  }

  const boundedEnd = Math.min(end, matches.length - 1);
  return {
    start,
    end: boundedEnd,
    slice: matches.slice(start, boundedEnd + 1),
  };
}

function filterVerifiedMatches(matches: HistoricalMatchRecord[]): HistoricalMatchRecord[] {
  return matches.filter((record) => record.status === "VERIFIED" && record.result !== null);
}

export function runMarketKnowledgeReplay(
  options: ReplayMarketKnowledgeOptions
): ReplayMarketKnowledgeResult {
  const startedAt = Date.now();
  const dryRun = options.dryRun ?? false;
  const store = options.store ?? marketKnowledgeStore;
  const repository = options.repository;
  const { slice } = resolveReplayRange(
    options.matches,
    options.startIndex,
    options.endIndex
  );

  const steps: ReplayStep[] = [];
  const snapshots: MarketKnowledgeSnapshot[] = [];
  const cumulativeMatches: HistoricalMatchRecord[] = [];
  let previousSnapshot: MarketKnowledgeSnapshot | null = null;

  for (let index = 0; index < slice.length; index += 1) {
    const match = slice[index];
    if (match.status !== "VERIFIED" || !match.result) {
      continue;
    }

    cumulativeMatches.push(match);
    const generatedAt = match.verificationResult?.verifiedAt ?? match.updatedAt;
    const snapshot = buildMarketKnowledgeFromVerifiedMatches(cumulativeMatches, {
      snapshotId: randomUUID(),
      generatedAt,
    });
    snapshot.version = MARKET_KNOWLEDGE_SNAPSHOT_VERSION;

    const changes = compareKnowledgeSnapshots(previousSnapshot, snapshot);
    const step: ReplayStep = {
      stepIndex: index + 1,
      matchId: match.id,
      snapshotId: snapshot.id,
      ...changes,
    };

    if (!dryRun) {
      if (repository) {
        repository.saveSnapshot(snapshot, {
          metadata: {
            source: "REPLAY",
            matchCount: cumulativeMatches.length,
            firstMatchId: cumulativeMatches[0]?.id ?? null,
            lastMatchId: match.id,
            parentSnapshotId: previousSnapshot?.id ?? null,
          },
        });
      } else {
        store.saveSnapshot(snapshot);
      }
    }

    steps.push(step);
    snapshots.push(snapshot);
    previousSnapshot = snapshot;
  }

  const audit = steps.map(buildReplayAuditEntry);
  const updateCounts = countUniqueUpdates(steps);
  const firstSnapshot = snapshots[0] ?? null;
  const lastSnapshot = snapshots[snapshots.length - 1] ?? null;
  const statisticsDiff = buildStatisticsDiff(firstSnapshot, lastSnapshot);

  const report = finalizeReplayReport({
    matchesProcessed: steps.length,
    ...updateCounts,
    snapshotCount: snapshots.length,
    processingTimeMs: Date.now() - startedAt,
    dryRun,
    steps,
    audit,
    snapshots,
    firstSnapshotId: firstSnapshot?.id ?? null,
    lastSnapshotId: lastSnapshot?.id ?? null,
    statisticsDiff,
    validation: validateReplayResult({
      steps,
      snapshots,
      processedMatches: filterVerifiedMatches(slice),
    }),
  });

  return { report };
}

export function replayMarketKnowledge(
  options: ReplayMarketKnowledgeOptions
): ReplayMarketKnowledgeResult {
  return runMarketKnowledgeReplay(options);
}

export { resolveReplayRange, filterVerifiedMatches };
