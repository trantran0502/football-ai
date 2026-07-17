import {
  NOT_IMPLEMENTED_KNOWLEDGE_MESSAGE,
  type HistoricalPattern,
  type KnowledgeMarketType,
  type MarketKnowledgeQueryResult,
  type MarketStatisticsEntry,
  type PatternStatistics,
  type RuleStatistics,
} from "./marketKnowledgeTypes";
import type { LeagueStatistics } from "./marketKnowledgeTypes";

export interface MarketKnowledgeQueries {
  getRuleStatistics(ruleId: string): MarketKnowledgeQueryResult<RuleStatistics>;
  getPatternStatistics(patternId: string): MarketKnowledgeQueryResult<PatternStatistics>;
  getLeagueStatistics(
    leagueId: string,
    marketType?: KnowledgeMarketType
  ): MarketKnowledgeQueryResult<LeagueStatistics>;
  getMarketStatistics(
    marketType: KnowledgeMarketType
  ): MarketKnowledgeQueryResult<MarketStatisticsEntry>;
  getHistoricalPattern(query: {
    marketType?: KnowledgeMarketType;
    patternId?: string | null;
    ruleIds?: string[];
    leagueId?: string | null;
  }): MarketKnowledgeQueryResult<HistoricalPattern>;
}

function notImplementedQueryResult<T>(): MarketKnowledgeQueryResult<T> {
  return {
    status: "notImplemented",
    message: NOT_IMPLEMENTED_KNOWLEDGE_MESSAGE,
    data: null,
  };
}

export function createNotImplementedMarketKnowledgeQueries(): MarketKnowledgeQueries {
  return {
    getRuleStatistics() {
      return notImplementedQueryResult<RuleStatistics>();
    },
    getPatternStatistics() {
      return notImplementedQueryResult<PatternStatistics>();
    },
    getLeagueStatistics() {
      return notImplementedQueryResult<LeagueStatistics>();
    },
    getMarketStatistics() {
      return notImplementedQueryResult<MarketStatisticsEntry>();
    },
    getHistoricalPattern() {
      return notImplementedQueryResult<HistoricalPattern>();
    },
  };
}

export const marketKnowledgeQueries = createNotImplementedMarketKnowledgeQueries();

export function getRuleStatistics(
  ruleId: string
): MarketKnowledgeQueryResult<RuleStatistics> {
  return marketKnowledgeQueries.getRuleStatistics(ruleId);
}

export function getPatternStatistics(
  patternId: string
): MarketKnowledgeQueryResult<PatternStatistics> {
  return marketKnowledgeQueries.getPatternStatistics(patternId);
}

export function getLeagueStatistics(
  leagueId: string,
  marketType?: KnowledgeMarketType
): MarketKnowledgeQueryResult<LeagueStatistics> {
  return marketKnowledgeQueries.getLeagueStatistics(leagueId, marketType);
}

export function getMarketStatistics(
  marketType: KnowledgeMarketType
): MarketKnowledgeQueryResult<MarketStatisticsEntry> {
  return marketKnowledgeQueries.getMarketStatistics(marketType);
}

export function getHistoricalPattern(query: {
  marketType?: KnowledgeMarketType;
  patternId?: string | null;
  ruleIds?: string[];
  leagueId?: string | null;
}): MarketKnowledgeQueryResult<HistoricalPattern> {
  return marketKnowledgeQueries.getHistoricalPattern(query);
}
