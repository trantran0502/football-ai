import type { MarketKnowledgeSnapshot } from "../marketKnowledgeTypes";

export type MarketKnowledgeSource = "REPLAY" | "BACKFILL" | "INCREMENTAL" | "MANUAL";

export interface MarketKnowledgeSnapshotMetadata {
  source: MarketKnowledgeSource;
  matchCount: number;
  firstMatchId: string | null;
  lastMatchId: string | null;
  parentSnapshotId: string | null;
  schemaVersion: string;
  engineVersion: string;
}

export interface PersistedMarketKnowledgeSnapshot {
  snapshot: MarketKnowledgeSnapshot;
  metadata: MarketKnowledgeSnapshotMetadata;
  checksum: string;
}

export interface MarketKnowledgeManifestEntry {
  snapshotId: string;
  createdAt: string;
  knowledgeVersion: string;
  source: MarketKnowledgeSource;
  matchCount: number;
  checksum: string;
  filePath: string;
}

export interface MarketKnowledgeManifest {
  version: string;
  latestSnapshotId: string | null;
  snapshotCount: number;
  snapshots: MarketKnowledgeManifestEntry[];
}

export interface MarketKnowledgeRepositoryListOptions {
  limit?: number;
  offset?: number;
}

export interface MarketKnowledgeRepositorySaveOptions {
  overwrite?: boolean;
  metadata?: Partial<MarketKnowledgeSnapshotMetadata>;
}

export interface MarketKnowledgePersistenceReport {
  savedSnapshotId: string;
  checksum: string;
  filePath: string | null;
  manifestUpdated: boolean;
  durationMs: number;
}

export interface MarketKnowledgeRebuildManifestResult {
  validSnapshots: string[];
  invalidSnapshots: Array<{ snapshotId: string; reason: string }>;
  latestSnapshotId: string | null;
  manifest: MarketKnowledgeManifest;
}

export class MarketKnowledgeIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketKnowledgeIntegrityError";
  }
}

export class MarketKnowledgeDuplicateSnapshotError extends Error {
  constructor(snapshotId: string) {
    super(`Snapshot already exists: ${snapshotId}`);
    this.name = "MarketKnowledgeDuplicateSnapshotError";
  }
}
