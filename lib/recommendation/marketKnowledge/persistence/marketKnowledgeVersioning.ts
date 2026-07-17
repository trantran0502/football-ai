export const MARKET_KNOWLEDGE_SCHEMA_VERSION = "1.0.0";
export const MARKET_KNOWLEDGE_ENGINE_VERSION = "1.1.0";
export const MARKET_KNOWLEDGE_MANIFEST_VERSION = "1.0.0";

export function createDefaultSnapshotMetadata(
  partial: Partial<import("./marketKnowledgePersistenceTypes").MarketKnowledgeSnapshotMetadata> = {}
): import("./marketKnowledgePersistenceTypes").MarketKnowledgeSnapshotMetadata {
  return {
    source: partial.source ?? "MANUAL",
    matchCount: partial.matchCount ?? 0,
    firstMatchId: partial.firstMatchId ?? null,
    lastMatchId: partial.lastMatchId ?? null,
    parentSnapshotId: partial.parentSnapshotId ?? null,
    schemaVersion: partial.schemaVersion ?? MARKET_KNOWLEDGE_SCHEMA_VERSION,
    engineVersion: partial.engineVersion ?? MARKET_KNOWLEDGE_ENGINE_VERSION,
  };
}

export function normalizeKnowledgeVersion(snapshotVersion: string): string {
  return snapshotVersion;
}
