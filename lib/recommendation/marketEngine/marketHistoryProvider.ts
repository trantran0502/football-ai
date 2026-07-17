import type { HistoricalPatternResult, MarketEngineType } from "./marketEngineTypes";
import type {
  MarketRuleHistoryProvider,
  RuleHistoricalPatternResult,
  RuleHistoricalQuery,
} from "./rules/ruleTypes";
import { NOT_IMPLEMENTED_RULE_HISTORICAL_PATTERN } from "./rules/ruleTypes";

export interface MarketHistoryQuery {
  marketType: MarketEngineType;
  line?: number | null;
  period?: string;
  side?: string | null;
}

export interface MarketHistoryProvider extends MarketRuleHistoryProvider {
  getHistoricalPattern(query: MarketHistoryQuery): HistoricalPatternResult;
}

export type { RuleHistoricalPatternResult, RuleHistoricalQuery };

export const NOT_IMPLEMENTED_HISTORICAL_PATTERN: HistoricalPatternResult = {
  status: "notImplemented",
  sampleSize: null,
  hitRate: null,
  roi: null,
  confidence: null,
  message: "Not Implemented",
};

export function createNotImplementedMarketHistoryProvider(): MarketHistoryProvider {
  return {
    getHistoricalPattern() {
      return { ...NOT_IMPLEMENTED_HISTORICAL_PATTERN };
    },
    getRuleHistoricalPattern(query: RuleHistoricalQuery): RuleHistoricalPatternResult {
      return {
        ...NOT_IMPLEMENTED_RULE_HISTORICAL_PATTERN,
        ruleId: query.ruleId,
      };
    },
  };
}
