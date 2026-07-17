import type { MarketSelection } from "@/types/match";
import { AHAnalyzer } from "./analyzers/ahAnalyzer";
import { BTTSAnalyzer } from "./analyzers/bttsAnalyzer";
import { MoneylineAnalyzer } from "./analyzers/moneylineAnalyzer";
import { OUAnalyzer } from "./analyzers/ouAnalyzer";
import {
  createNotImplementedMarketHistoryProvider,
  type MarketHistoryProvider,
} from "./marketHistoryProvider";
import type {
  MarketAnalysis,
  MarketAnalysisSnapshot,
  MarketAnalyzer,
} from "./marketEngineTypes";
import { MARKET_ENGINE_INITIAL_WEIGHT } from "./marketScore";

export const MARKET_ENGINE_VERSION = "1.2.0";

export const MARKET_ENGINE_ANALYZERS: MarketAnalyzer[] = [
  MoneylineAnalyzer,
  AHAnalyzer,
  OUAnalyzer,
  BTTSAnalyzer,
];

export interface RunMarketEngineOptions {
  historyProvider?: MarketHistoryProvider;
  generatedAt?: string;
}

export function runMarketEngine(
  selections: MarketSelection[],
  options: RunMarketEngineOptions = {}
): MarketAnalysisSnapshot {
  const historyProvider =
    options.historyProvider ?? createNotImplementedMarketHistoryProvider();

  const markets: MarketAnalysis[] = [];

  for (const analyzer of MARKET_ENGINE_ANALYZERS) {
    const analysis = analyzer.analyze(selections, historyProvider);
    if (analysis) {
      markets.push(analysis);
    }
  }

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    engineVersion: MARKET_ENGINE_VERSION,
    marketEngineWeight: MARKET_ENGINE_INITIAL_WEIGHT,
    markets,
  };
}

export function analyzeMarket(
  marketType: MarketAnalysis["marketType"],
  selections: MarketSelection[],
  historyProvider?: MarketHistoryProvider
): MarketAnalysis | null {
  const provider =
    historyProvider ?? createNotImplementedMarketHistoryProvider();
  const analyzer = MARKET_ENGINE_ANALYZERS.find((item) => item.marketType === marketType);
  if (!analyzer) {
    return null;
  }
  return analyzer.analyze(selections, provider);
}
