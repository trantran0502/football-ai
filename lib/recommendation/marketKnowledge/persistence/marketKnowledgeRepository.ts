import type { MarketKnowledgeSnapshot } from "../marketKnowledgeTypes";
import type {
  MarketKnowledgeManifest,
  MarketKnowledgePersistenceReport,
  MarketKnowledgeRepositoryListOptions,
  MarketKnowledgeRepositorySaveOptions,
} from "./marketKnowledgePersistenceTypes";

export interface MarketKnowledgeRepository {
  saveSnapshot(
    snapshot: MarketKnowledgeSnapshot,
    options?: MarketKnowledgeRepositorySaveOptions
  ): MarketKnowledgePersistenceReport;
  loadSnapshot(snapshotId: string): MarketKnowledgeSnapshot | null;
  loadLatestSnapshot(): MarketKnowledgeSnapshot | null;
  listSnapshots(options?: MarketKnowledgeRepositoryListOptions): MarketKnowledgeSnapshot[];
  deleteSnapshot(snapshotId: string): boolean;
  snapshotExists(snapshotId: string): boolean;
  getManifest?(): MarketKnowledgeManifest;
}

export type {
  MarketKnowledgeRepositoryListOptions,
  MarketKnowledgeRepositorySaveOptions,
  MarketKnowledgePersistenceReport,
};

export {
  InMemoryMarketKnowledgeRepository,
  createInMemoryMarketKnowledgeRepository,
} from "./inMemoryMarketKnowledgeRepository";
export {
  FileMarketKnowledgeRepository,
  createFileMarketKnowledgeRepository,
  rebuildManifest,
  DEFAULT_BASE_DIR,
} from "./fileMarketKnowledgeRepository";
