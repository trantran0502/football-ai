import { randomUUID } from "crypto";
import {
  createEmptyMarketKnowledgeSnapshot,
  NOT_IMPLEMENTED_KNOWLEDGE_MESSAGE,
  type MarketKnowledgeSnapshot,
} from "./marketKnowledgeTypes";

export interface MarketKnowledgeStore {
  saveSnapshot(snapshot: MarketKnowledgeSnapshot): MarketKnowledgeSnapshot;
  loadSnapshot(snapshotId: string): MarketKnowledgeSnapshot | null;
  listSnapshots(): MarketKnowledgeSnapshot[];
}

const snapshots = new Map<string, MarketKnowledgeSnapshot>();

export function createInMemoryMarketKnowledgeStore(): MarketKnowledgeStore {
  return {
    saveSnapshot(snapshot) {
      snapshots.set(snapshot.id, snapshot);
      return snapshot;
    },
    loadSnapshot(snapshotId) {
      return snapshots.get(snapshotId) ?? null;
    },
    listSnapshots() {
      return [...snapshots.values()].sort((left, right) =>
        right.generatedAt.localeCompare(left.generatedAt)
      );
    },
  };
}

export const marketKnowledgeStore = createInMemoryMarketKnowledgeStore();

export function saveSnapshot(snapshot: MarketKnowledgeSnapshot): MarketKnowledgeSnapshot {
  return marketKnowledgeStore.saveSnapshot(snapshot);
}

export function loadSnapshot(snapshotId: string): MarketKnowledgeSnapshot | null {
  return marketKnowledgeStore.loadSnapshot(snapshotId);
}

export function listSnapshots(): MarketKnowledgeSnapshot[] {
  return marketKnowledgeStore.listSnapshots();
}

export function getLatestSnapshot(): MarketKnowledgeSnapshot | null {
  const snapshots = listSnapshots();
  return snapshots[0] ?? null;
}

export function createPlaceholderKnowledgeSnapshot(
  generatedAt = new Date().toISOString()
): MarketKnowledgeSnapshot {
  return createEmptyMarketKnowledgeSnapshot(randomUUID(), generatedAt);
}

export function resetMarketKnowledgeStoreForTests(): void {
  snapshots.clear();
}

export { NOT_IMPLEMENTED_KNOWLEDGE_MESSAGE };
