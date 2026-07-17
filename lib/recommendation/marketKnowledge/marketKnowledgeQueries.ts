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
import { marketKnowledgeStore } from "./marketKnowledgeStore";

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

function availableQueryResult<T>(data: T): MarketKnowledgeQueryResult<T> {
  return {
    status: "available",
    message: "Loaded from latest market knowledge snapshot.",
    data,
  };
}

export function createStoreBackedMarketKnowledgeQueries(
  store: Pick<typeof marketKnowledgeStore, "listSnapshots">
): MarketKnowledgeQueries {
  return {
    getRuleStatistics(ruleId) {
      const snapshot = store.listSnapshots()[0];
      if (!snapshot || snapshot.status !== "available") {
        return notImplementedQueryResult<RuleStatistics>();
      }
      const rule = snapshot.ruleStatistics.find((item) => item.ruleId === ruleId);
      if (!rule) {
        return notImplementedQueryResult<RuleStatistics>();
      }
      return availableQueryResult(rule);
    },
    getPatternStatistics(patternId) {
      const snapshot = store.listSnapshots()[0];
      if (!snapshot || snapshot.status !== "available") {
        return notImplementedQueryResult<PatternStatistics>();
      }
      const pattern = snapshot.patternStatistics.find(
        (item) => item.patternId === patternId
      );
      if (!pattern) {
        return notImplementedQueryResult<PatternStatistics>();
      }
      return availableQueryResult(pattern);
    },
    getLeagueStatistics(leagueId, marketType) {
      const snapshot = store.listSnapshots()[0];
      if (!snapshot || snapshot.status !== "available") {
        return notImplementedQueryResult<LeagueStatistics>();
      }
      const league = snapshot.leagueStatistics.find(
        (item) =>
          item.leagueId === leagueId &&
          (marketType ? item.marketType === marketType : true)
      );
      if (!league) {
        return notImplementedQueryResult<LeagueStatistics>();
      }
      return availableQueryResult(league);
    },
    getMarketStatistics(marketType) {
      const snapshot = store.listSnapshots()[0];
      if (!snapshot || snapshot.status !== "available") {
        return notImplementedQueryResult<MarketStatisticsEntry>();
      }
      return availableQueryResult(snapshot.marketStatistics[marketType]);
    },
    getHistoricalPattern(query) {
      const snapshot = store.listSnapshots()[0];
      if (!snapshot || snapshot.status !== "available") {
        return notImplementedQueryResult<HistoricalPattern>();
      }

      const pattern = snapshot.historicalPatterns.find((item) => {
        if (query.marketType && item.marketType !== query.marketType) {
          return false;
        }
        if (query.patternId !== undefined && item.patternId !== query.patternId) {
          return false;
        }
        if (query.leagueId !== undefined && item.leagueId !== query.leagueId) {
          return false;
        }
        if (query.ruleIds && query.ruleIds.length > 0) {
          return query.ruleIds.every((ruleId) => item.ruleIds.includes(ruleId));
        }
        return true;
      });

      if (!pattern) {
        return notImplementedQueryResult<HistoricalPattern>();
      }
      return availableQueryResult(pattern);
    },
  };
}

export function createNotImplementedMarketKnowledgeQueries(): MarketKnowledgeQueries {
  return createStoreBackedMarketKnowledgeQueries({
    listSnapshots: () => [],
  });
}

export const marketKnowledgeQueries =
  createStoreBackedMarketKnowledgeQueries(marketKnowledgeStore);

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
