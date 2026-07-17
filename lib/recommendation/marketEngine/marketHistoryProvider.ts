import type { HistoricalPatternResult, MarketEngineType } from "./marketEngineTypes";

export interface MarketHistoryQuery {
  marketType: MarketEngineType;
  line?: number | null;
  period?: string;
  side?: string | null;
}

export interface MarketHistoryProvider {
  getHistoricalPattern(query: MarketHistoryQuery): HistoricalPatternResult;
}

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
  };
}
