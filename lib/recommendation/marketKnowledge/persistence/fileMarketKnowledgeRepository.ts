import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import path from "path";
import type { MarketKnowledgeSnapshot } from "../marketKnowledgeTypes";
import {
  buildPersistedSnapshot,
  verifyPersistedSnapshotChecksum,
} from "./marketKnowledgePersistence";
import type {
  MarketKnowledgeManifest,
  MarketKnowledgeManifestEntry,
  MarketKnowledgePersistenceReport,
  MarketKnowledgeRebuildManifestResult,
  MarketKnowledgeRepositoryListOptions,
  MarketKnowledgeRepositorySaveOptions,
  PersistedMarketKnowledgeSnapshot,
} from "./marketKnowledgePersistenceTypes";
import { MarketKnowledgeDuplicateSnapshotError } from "./marketKnowledgePersistenceTypes";
import { validateMarketKnowledgeSnapshotIntegrity } from "./marketKnowledgeIntegrity";
import type { MarketKnowledgeRepository } from "./marketKnowledgeRepository";
import {
  createDefaultSnapshotMetadata,
  MARKET_KNOWLEDGE_MANIFEST_VERSION,
  normalizeKnowledgeVersion,
} from "./marketKnowledgeVersioning";

const DEFAULT_BASE_DIR = path.join(process.cwd(), "data", "market-knowledge");

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

export class FileMarketKnowledgeRepository implements MarketKnowledgeRepository {
  constructor(private readonly baseDir: string = DEFAULT_BASE_DIR) {}

  getSnapshotsDir(): string {
    return path.join(this.baseDir, "snapshots");
  }

  getManifestPath(): string {
    return path.join(this.baseDir, "manifest.json");
  }

  getSnapshotPath(snapshotId: string): string {
    return path.join(this.getSnapshotsDir(), `${snapshotId}.json`);
  }

  getSnapshotTempPath(snapshotId: string): string {
    return path.join(this.getSnapshotsDir(), `${snapshotId}.tmp`);
  }

  ensureDirectories(): void {
    mkdirSync(this.getSnapshotsDir(), { recursive: true });
  }

  readManifest(): MarketKnowledgeManifest {
    const manifestPath = this.getManifestPath();
    if (!existsSync(manifestPath)) {
      return createEmptyManifest();
    }

    try {
      const raw = readFileSync(manifestPath, "utf8");
      return JSON.parse(raw) as MarketKnowledgeManifest;
    } catch {
      return createEmptyManifest();
    }
  }

  writeManifest(manifest: MarketKnowledgeManifest): void {
    this.ensureDirectories();
    const manifestTemp = `${this.getManifestPath()}.tmp`;
    writeFileSync(manifestTemp, JSON.stringify(manifest, null, 2), "utf8");
    renameSync(manifestTemp, this.getManifestPath());
  }

  saveSnapshot(
    snapshot: MarketKnowledgeSnapshot,
    options: MarketKnowledgeRepositorySaveOptions = {}
  ): MarketKnowledgePersistenceReport {
    const startedAt = Date.now();
    validateMarketKnowledgeSnapshotIntegrity(snapshot);
    this.ensureDirectories();

    const finalPath = this.getSnapshotPath(snapshot.id);
    const tempPath = this.getSnapshotTempPath(snapshot.id);

    if (this.snapshotExists(snapshot.id) && !options.overwrite) {
      throw new MarketKnowledgeDuplicateSnapshotError(snapshot.id);
    }

    const metadata = createDefaultSnapshotMetadata({
      ...snapshot.metadata,
      ...options.metadata,
      engineVersion:
        options.metadata?.engineVersion ??
        snapshot.metadata?.engineVersion ??
        snapshot.version,
    });

    const persisted = buildPersistedSnapshot(snapshot, metadata);
    writeFileSync(tempPath, JSON.stringify(persisted, null, 2), "utf8");

    const loadedRaw = readFileSync(tempPath, "utf8");
    const loaded = JSON.parse(loadedRaw) as PersistedMarketKnowledgeSnapshot;
    verifyPersistedSnapshotChecksum(loaded);
    validateMarketKnowledgeSnapshotIntegrity(loaded.snapshot);

    renameSync(tempPath, finalPath);

    const manifest = this.readManifest();
    const entry: MarketKnowledgeManifestEntry = {
      snapshotId: snapshot.id,
      createdAt: snapshot.generatedAt,
      knowledgeVersion: normalizeKnowledgeVersion(snapshot.version),
      source: metadata.source,
      matchCount: metadata.matchCount,
      checksum: persisted.checksum,
      filePath: path.relative(process.cwd(), finalPath).replace(/\\/g, "/"),
    };

    const existingIndex = manifest.snapshots.findIndex(
      (item) => item.snapshotId === snapshot.id
    );
    if (existingIndex >= 0) {
      manifest.snapshots[existingIndex] = entry;
    } else {
      manifest.snapshots.push(entry);
    }

    manifest.snapshots = sortManifestEntries(manifest.snapshots);
    manifest.snapshotCount = manifest.snapshots.length;
    manifest.latestSnapshotId = manifest.snapshots[0]?.snapshotId ?? null;
    manifest.version = MARKET_KNOWLEDGE_MANIFEST_VERSION;
    this.writeManifest(manifest);

    return {
      savedSnapshotId: snapshot.id,
      checksum: persisted.checksum,
      filePath: entry.filePath,
      manifestUpdated: true,
      durationMs: Date.now() - startedAt,
    };
  }

  loadSnapshot(snapshotId: string): MarketKnowledgeSnapshot | null {
    const filePath = this.getSnapshotPath(snapshotId);
    if (!existsSync(filePath)) {
      return null;
    }

    const raw = readFileSync(filePath, "utf8");
    const persisted = JSON.parse(raw) as PersistedMarketKnowledgeSnapshot;
    verifyPersistedSnapshotChecksum(persisted);
    validateMarketKnowledgeSnapshotIntegrity(persisted.snapshot);
    return persisted.snapshot;
  }

  loadLatestSnapshot(): MarketKnowledgeSnapshot | null {
    const manifest = this.readManifest();
    if (!manifest.latestSnapshotId) {
      return null;
    }
    return this.loadSnapshot(manifest.latestSnapshotId);
  }

  listSnapshots(options: MarketKnowledgeRepositoryListOptions = {}): MarketKnowledgeSnapshot[] {
    const manifest = this.readManifest();
    const offset = options.offset ?? 0;
    const limit = options.limit ?? manifest.snapshots.length;
    const snapshots: MarketKnowledgeSnapshot[] = [];

    for (const entry of manifest.snapshots.slice(offset, offset + limit)) {
      const snapshot = this.loadSnapshot(entry.snapshotId);
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }

    return snapshots;
  }

  deleteSnapshot(snapshotId: string): boolean {
    const filePath = this.getSnapshotPath(snapshotId);
    if (!existsSync(filePath)) {
      return false;
    }

    rmSync(filePath, { force: true });

    const manifest = this.readManifest();
    const before = manifest.snapshots.length;
    manifest.snapshots = manifest.snapshots.filter(
      (entry) => entry.snapshotId !== snapshotId
    );
    if (manifest.snapshots.length === before) {
      return false;
    }

    manifest.snapshotCount = manifest.snapshots.length;
    manifest.latestSnapshotId = manifest.snapshots[0]?.snapshotId ?? null;
    this.writeManifest(manifest);
    return true;
  }

  snapshotExists(snapshotId: string): boolean {
    return existsSync(this.getSnapshotPath(snapshotId));
  }

  getManifest(): MarketKnowledgeManifest {
    return this.readManifest();
  }
}

export function createFileMarketKnowledgeRepository(
  baseDir: string = DEFAULT_BASE_DIR
): FileMarketKnowledgeRepository {
  return new FileMarketKnowledgeRepository(baseDir);
}

export function rebuildManifest(
  baseDir: string = DEFAULT_BASE_DIR
): MarketKnowledgeRebuildManifestResult {
  const repo = new FileMarketKnowledgeRepository(baseDir);
  const snapshotsDir = repo.getSnapshotsDir();
  const validSnapshots: string[] = [];
  const invalidSnapshots: Array<{ snapshotId: string; reason: string }> = [];

  let files: string[] = [];
  if (existsSync(snapshotsDir)) {
    files = readdirSync(snapshotsDir);
  }

  const entries: MarketKnowledgeManifestEntry[] = [];

  for (const fileName of files) {
    if (!fileName.endsWith(".json")) {
      continue;
    }

    const snapshotId = fileName.replace(/\.json$/, "");
    const filePath = path.join(snapshotsDir, fileName);

    try {
      const raw = readFileSync(filePath, "utf8");
      const persisted = JSON.parse(raw) as PersistedMarketKnowledgeSnapshot;
      verifyPersistedSnapshotChecksum(persisted);
      validateMarketKnowledgeSnapshotIntegrity(persisted.snapshot);

      validSnapshots.push(snapshotId);
      entries.push({
        snapshotId: persisted.snapshot.id,
        createdAt: persisted.snapshot.generatedAt,
        knowledgeVersion: normalizeKnowledgeVersion(persisted.snapshot.version),
        source: persisted.metadata.source,
        matchCount: persisted.metadata.matchCount,
        checksum: persisted.checksum,
        filePath: path.relative(process.cwd(), filePath).replace(/\\/g, "/"),
      });
    } catch (error) {
      invalidSnapshots.push({
        snapshotId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const sortedEntries = sortManifestEntries(entries);
  const manifest: MarketKnowledgeManifest = {
    version: MARKET_KNOWLEDGE_MANIFEST_VERSION,
    latestSnapshotId: sortedEntries[0]?.snapshotId ?? null,
    snapshotCount: sortedEntries.length,
    snapshots: sortedEntries,
  };

  repo.writeManifest(manifest);

  return {
    validSnapshots,
    invalidSnapshots,
    latestSnapshotId: manifest.latestSnapshotId,
    manifest,
  };
}

export { DEFAULT_BASE_DIR };
