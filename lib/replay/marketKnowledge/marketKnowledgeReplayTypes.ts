import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { MarketKnowledgeStore } from "@/lib/recommendation/marketKnowledge/marketKnowledgeStore";
import type { MarketKnowledgeRepository } from "@/lib/recommendation/marketKnowledge/persistence/marketKnowledgeRepository";
import type { KnowledgeMarketType, MarketKnowledgeSnapshot } from "@/lib/recommendation/marketKnowledge/marketKnowledgeTypes";

export interface ReplayMarketKnowledgeOptions {
  matches: HistoricalMatchRecord[];
  startIndex?: number;
  endIndex?: number;
  dryRun?: boolean;
  store?: MarketKnowledgeStore;
  repository?: MarketKnowledgeRepository;
}

export interface ReplayStatChange {
  id: string;
  previousSampleSize: number;
  nextSampleSize: number;
  sampleSizeDelta: number;
  previousHitRate: number;
  nextHitRate: number;
  previousRoi: number;
  nextRoi: number;
}

export interface ReplayMarketStatChange {
  marketType: KnowledgeMarketType;
  previousSampleSize: number;
  nextSampleSize: number;
  sampleSizeDelta: number;
  previousHitRate: number;
  nextHitRate: number;
  previousRoi: number;
  nextRoi: number;
}

export interface ReplayStep {
  stepIndex: number;
  matchId: string;
  snapshotId: string;
  ruleChanges: ReplayStatChange[];
  patternChanges: ReplayStatChange[];
  marketChanges: ReplayMarketStatChange[];
  leagueChanges: ReplayStatChange[];
}

export interface ReplayAuditEntry {
  stepIndex: number;
  matchId: string;
  snapshotId: string;
  updatedRuleIds: string[];
  updatedPatternIds: string[];
  updatedLeagueKeys: string[];
  updatedMarketTypes: KnowledgeMarketType[];
}

export interface StatisticsDiff {
  rules: ReplayStatChange[];
  patterns: ReplayStatChange[];
  markets: ReplayMarketStatChange[];
  leagues: ReplayStatChange[];
}

export interface ReplayValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ReplayReport {
  matchesProcessed: number;
  ruleUpdates: number;
  patternUpdates: number;
  marketUpdates: number;
  leagueUpdates: number;
  snapshotCount: number;
  processingTimeMs: number;
  dryRun: boolean;
  steps: ReplayStep[];
  audit: ReplayAuditEntry[];
  snapshots: MarketKnowledgeSnapshot[];
  firstSnapshotId: string | null;
  lastSnapshotId: string | null;
  statisticsDiff: StatisticsDiff | null;
  validation: ReplayValidationResult;
}

export interface ReplayMarketKnowledgeResult {
  report: ReplayReport;
}
