import { createHash } from "crypto";
import type { MarketKnowledgeSnapshot } from "../marketKnowledgeTypes";
import type {
  MarketKnowledgeSnapshotMetadata,
  PersistedMarketKnowledgeSnapshot,
} from "./marketKnowledgePersistenceTypes";
import { MarketKnowledgeIntegrityError } from "./marketKnowledgePersistenceTypes";

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

function normalizeForChecksum<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function computeSnapshotChecksum(
  snapshot: MarketKnowledgeSnapshot,
  metadata: MarketKnowledgeSnapshotMetadata
): string {
  const { metadata: _embeddedMetadata, ...snapshotBody } = snapshot;
  const payload = normalizeForChecksum({
    snapshot: snapshotBody,
    metadata,
  });
  return createHash("sha256").update(stableSerialize(payload)).digest("hex");
}

export function buildPersistedSnapshot(
  snapshot: MarketKnowledgeSnapshot,
  metadata: MarketKnowledgeSnapshotMetadata
): PersistedMarketKnowledgeSnapshot {
  const checksum = computeSnapshotChecksum(snapshot, metadata);
  return {
    snapshot: {
      ...snapshot,
      metadata,
    },
    metadata,
    checksum,
  };
}

export function verifyPersistedSnapshotChecksum(
  persisted: PersistedMarketKnowledgeSnapshot
): void {
  const expected = computeSnapshotChecksum(persisted.snapshot, persisted.metadata);
  if (expected !== persisted.checksum) {
    throw new MarketKnowledgeIntegrityError(
      `Checksum mismatch for snapshot ${persisted.snapshot.id}: expected ${expected}, got ${persisted.checksum}.`
    );
  }
}

export { stableSerialize };
