import type { MarketEngineType } from "@/lib/recommendation/marketEngine/marketEngineTypes";

import type { MarketKnowledgeSnapshotMetadata } from "./persistence/marketKnowledgePersistenceTypes";

export type KnowledgeMarketType = MarketEngineType;

export type KnowledgeStatus = "notImplemented" | "available";

export interface NotImplementedKnowledgeResult<T> {
  status: "notImplemented";
  message: string;
  data: T | null;
}

export interface RuleStatistics {
  ruleId: string;
  sampleSize: number;
  hitCount: number;
  missCount: number;
  pushCount: number;
  hitRate: number;
  roi: number;
  averageOdds: number;
  averageConfidence: number;
  averageMarketScore: number;
  firstSeen: string | null;
  lastSeen: string | null;
  lastUpdated: string | null;
}

export interface PatternLeagueHitRate {
  leagueName: string;
  hits: number;
  total: number;
  profit: number;
  stake: number;
}

export interface PatternStatistics {
  patternId: string;
  sampleSize: number;
  hitCount: number;
  totalProfit: number;
  totalStake: number;
  hitRate: number;
  roi: number;
  averageOdds: number;
  averageConfidence: number;
  averageMarketScore: number;
  bestLeague: string | null;
  worstLeague: string | null;
  /** Per-league decisive outcomes; required for incremental snapshot round-trip. */
  leagueHitRates: PatternLeagueHitRate[];
  firstSeen: string | null;
  lastSeen: string | null;
}

export interface MarketStatisticsEntry {
  marketType: KnowledgeMarketType;
  sampleSize: number;
  hitRate: number;
  roi: number;
  averageOdds: number;
  averageMarketScore: number;
}

export type MarketStatisticsMap = Record<KnowledgeMarketType, MarketStatisticsEntry>;

export interface LeagueStatistics {
  leagueId: string;
  leagueName: string;
  marketType: KnowledgeMarketType;
  sampleSize: number;
  hitRate: number;
  roi: number;
  averageOdds: number;
}

export interface HistoricalPattern {
  marketType: KnowledgeMarketType;
  patternId: string | null;
  ruleIds: string[];
  leagueId: string | null;
  oddsRange: string | null;
  waterRange: string | null;
  sampleSize: number;
  hitRate: number;
  roi: number;
  confidence: number;
}

export interface MarketKnowledgeSnapshot {
  id: string;
  generatedAt: string;
  version: string;
  status: KnowledgeStatus;
  message?: string;
  metadata?: MarketKnowledgeSnapshotMetadata;
  ruleStatistics: RuleStatistics[];
  patternStatistics: PatternStatistics[];
  marketStatistics: MarketStatisticsMap;
  leagueStatistics: LeagueStatistics[];
  historicalPatterns: HistoricalPattern[];
}

export interface MarketKnowledgeBuilderResult<T> {
  status: KnowledgeStatus;
  message: string;
  data: T | null;
}

export interface MarketKnowledgeQueryResult<T> {
  status: KnowledgeStatus;
  message: string;
  data: T | null;
}

export const NOT_IMPLEMENTED_KNOWLEDGE_MESSAGE = "Not Implemented";

export function createEmptyMarketStatisticsMap(): MarketStatisticsMap {
  return {
    "1X2": emptyMarketStatisticsEntry("1X2"),
    AH: emptyMarketStatisticsEntry("AH"),
    "O/U": emptyMarketStatisticsEntry("O/U"),
    BTTS: emptyMarketStatisticsEntry("BTTS"),
  };
}

function emptyMarketStatisticsEntry(
  marketType: KnowledgeMarketType
): MarketStatisticsEntry {
  return {
    marketType,
    sampleSize: 0,
    hitRate: 0,
    roi: 0,
    averageOdds: 0,
    averageMarketScore: 0,
  };
}

export function createEmptyMarketKnowledgeSnapshot(
  id: string,
  generatedAt: string
): MarketKnowledgeSnapshot {
  return {
    id,
    generatedAt,
    version: "1.0.0",
    status: "notImplemented",
    message: NOT_IMPLEMENTED_KNOWLEDGE_MESSAGE,
    ruleStatistics: [],
    patternStatistics: [],
    marketStatistics: createEmptyMarketStatisticsMap(),
    leagueStatistics: [],
    historicalPatterns: [],
  };
}
