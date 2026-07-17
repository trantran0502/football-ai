import type { MarketKnowledgeSnapshot } from "../marketKnowledgeTypes";
import {
  buildPersistedSnapshot,
  verifyPersistedSnapshotChecksum,
} from "./marketKnowledgePersistence";
import type {
  MarketKnowledgeManifest,
  MarketKnowledgeManifestEntry,
  MarketKnowledgePersistenceReport,
  MarketKnowledgeRepositoryListOptions,
  MarketKnowledgeRepositorySaveOptions,
} from "./marketKnowledgePersistenceTypes";
import { MarketKnowledgeDuplicateSnapshotError } from "./marketKnowledgePersistenceTypes";
import { validateMarketKnowledgeSnapshotIntegrity } from "./marketKnowledgeIntegrity";
import type { MarketKnowledgeRepository } from "./marketKnowledgeRepository";
import {
  createDefaultSnapshotMetadata,
  MARKET_KNOWLEDGE_MANIFEST_VERSION,
  normalizeKnowledgeVersion,
} from "./marketKnowledgeVersioning";

function createEmptyManifest(): MarketKnowledgeManifest {
  return {
    version: MARKET_KNOWLEDGE_MANIFEST_VERSION,
    latestSnapshotId: null,
    snapshotCount: 0,
    snapshots: [],
  };
}

function sortManifestEntries(
  entries: MarketKnowledgeManifestEntry[]
): MarketKnowledgeManifestEntry[] {
  return [...entries].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );
}

export class InMemoryMarketKnowledgeRepository implements MarketKnowledgeRepository {
  private readonly snapshots = new Map<string, MarketKnowledgeSnapshot>();
  private readonly checksums = new Map<string, string>();
  private manifest: MarketKnowledgeManifest = createEmptyManifest();

  saveSnapshot(
    snapshot: MarketKnowledgeSnapshot,
    options: MarketKnowledgeRepositorySaveOptions = {}
  ): MarketKnowledgePersistenceReport {
    const startedAt = Date.now();
    validateMarketKnowledgeSnapshotIntegrity(snapshot);

    if (this.snapshots.has(snapshot.id) && !options.overwrite) {
      throw new MarketKnowledgeDuplicateSnapshotError(snapshot.id);
    }

    const metadata = createDefaultSnapshotMetadata({
      ...snapshot.metadata,
      ...options.metadata,
      schemaVersion:
        options.metadata?.schemaVersion ??
        snapshot.metadata?.schemaVersion ??
        createDefaultSnapshotMetadata().schemaVersion,
      engineVersion:
        options.metadata?.engineVersion ??
        snapshot.metadata?.engineVersion ??
        snapshot.version,
    });

    const persisted = buildPersistedSnapshot(snapshot, metadata);
    verifyPersistedSnapshotChecksum(persisted);

    const savedSnapshot = persisted.snapshot;
    this.snapshots.set(savedSnapshot.id, savedSnapshot);
    this.checksums.set(savedSnapshot.id, persisted.checksum);

    const entry: MarketKnowledgeManifestEntry = {
      snapshotId: savedSnapshot.id,
      createdAt: savedSnapshot.generatedAt,
      knowledgeVersion: normalizeKnowledgeVersion(savedSnapshot.version),
      source: metadata.source,
      matchCount: metadata.matchCount,
      checksum: persisted.checksum,
      filePath: `memory://${savedSnapshot.id}`,
    };

    const existingIndex = this.manifest.snapshots.findIndex(
      (item) => item.snapshotId === savedSnapshot.id
    );
    if (existingIndex >= 0) {
      this.manifest.snapshots[existingIndex] = entry;
    } else {
      this.manifest.snapshots.push(entry);
    }

    this.manifest.snapshots = sortManifestEntries(this.manifest.snapshots);
    this.manifest.snapshotCount = this.manifest.snapshots.length;
    this.manifest.latestSnapshotId = this.manifest.snapshots[0]?.snapshotId ?? null;

    return {
      savedSnapshotId: savedSnapshot.id,
      checksum: persisted.checksum,
      filePath: entry.filePath,
      manifestUpdated: true,
      durationMs: Date.now() - startedAt,
    };
  }

  loadSnapshot(snapshotId: string): MarketKnowledgeSnapshot | null {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      return null;
    }

    const metadata = snapshot.metadata ?? createDefaultSnapshotMetadata();
    const persisted = buildPersistedSnapshot(snapshot, metadata);
    persisted.checksum = this.checksums.get(snapshotId) ?? persisted.checksum;
    verifyPersistedSnapshotChecksum(persisted);
    validateMarketKnowledgeSnapshotIntegrity(snapshot);
    return snapshot;
  }

  loadLatestSnapshot(): MarketKnowledgeSnapshot | null {
    const latestId = this.manifest.latestSnapshotId;
    if (!latestId) {
      return null;
    }
    return this.loadSnapshot(latestId);
  }

  listSnapshots(options: MarketKnowledgeRepositoryListOptions = {}): MarketKnowledgeSnapshot[] {
    const offset = options.offset ?? 0;
    const limit = options.limit ?? this.manifest.snapshots.length;
    return this.manifest.snapshots
      .slice(offset, offset + limit)
      .map((entry) => this.loadSnapshot(entry.snapshotId))
      .filter((snapshot): snapshot is MarketKnowledgeSnapshot => snapshot !== null);
  }

  deleteSnapshot(snapshotId: string): boolean {
    const deleted = this.snapshots.delete(snapshotId);
    this.checksums.delete(snapshotId);
    if (!deleted) {
      return false;
    }
    this.manifest.snapshots = this.manifest.snapshots.filter(
      (entry) => entry.snapshotId !== snapshotId
    );
    this.manifest.snapshotCount = this.manifest.snapshots.length;
    this.manifest.latestSnapshotId = this.manifest.snapshots[0]?.snapshotId ?? null;
    return true;
  }

  snapshotExists(snapshotId: string): boolean {
    return this.snapshots.has(snapshotId);
  }

  getManifest(): MarketKnowledgeManifest {
    return this.manifest;
  }

  resetForTests(): void {
    this.snapshots.clear();
    this.checksums.clear();
    this.manifest = createEmptyManifest();
  }
}

export function createInMemoryMarketKnowledgeRepository(): InMemoryMarketKnowledgeRepository {
  return new InMemoryMarketKnowledgeRepository();
}
