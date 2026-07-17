import {
  createEmptyMarketKnowledgeSnapshot,
  NOT_IMPLEMENTED_KNOWLEDGE_MESSAGE,
  type MarketKnowledgeBuilderResult,
  type MarketStatisticsMap,
  type PatternStatistics,
  type RuleStatistics,
} from "./marketKnowledgeTypes";
import type { LeagueStatistics } from "./marketKnowledgeTypes";

export interface MarketKnowledgeBuilder {
  buildRuleStatistics(): MarketKnowledgeBuilderResult<RuleStatistics[]>;
  buildPatternStatistics(): MarketKnowledgeBuilderResult<PatternStatistics[]>;
  buildLeagueStatistics(): MarketKnowledgeBuilderResult<LeagueStatistics[]>;
  buildMarketStatistics(): MarketKnowledgeBuilderResult<MarketStatisticsMap>;
}

function notImplementedResult<T>(): MarketKnowledgeBuilderResult<T> {
  return {
    status: "notImplemented",
    message: NOT_IMPLEMENTED_KNOWLEDGE_MESSAGE,
    data: null,
  };
}

export function createNotImplementedMarketKnowledgeBuilder(): MarketKnowledgeBuilder {
  return {
    buildRuleStatistics() {
      return notImplementedResult<RuleStatistics[]>();
    },
    buildPatternStatistics() {
      return notImplementedResult<PatternStatistics[]>();
    },
    buildLeagueStatistics() {
      return notImplementedResult<LeagueStatistics[]>();
    },
    buildMarketStatistics() {
      return notImplementedResult<MarketStatisticsMap>();
    },
  };
}

export const marketKnowledgeBuilder = createNotImplementedMarketKnowledgeBuilder();

export function buildRuleStatistics(): MarketKnowledgeBuilderResult<RuleStatistics[]> {
  return marketKnowledgeBuilder.buildRuleStatistics();
}

export function buildPatternStatistics(): MarketKnowledgeBuilderResult<PatternStatistics[]> {
  return marketKnowledgeBuilder.buildPatternStatistics();
}

export function buildLeagueStatistics(): MarketKnowledgeBuilderResult<LeagueStatistics[]> {
  return marketKnowledgeBuilder.buildLeagueStatistics();
}

export function buildMarketStatistics(): MarketKnowledgeBuilderResult<MarketStatisticsMap> {
  return marketKnowledgeBuilder.buildMarketStatistics();
}
