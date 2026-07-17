import type {
  MarketRuleAuditEntry,
  MarketRuleSignal,
  ScoreBreakdownEntry,
} from "./rules/ruleTypes";

export type MarketEngineType = "1X2" | "AH" | "O/U" | "BTTS";

export type MarketRiskLevel = "low" | "medium" | "high";

export type MarketRecommendationAction = "lean" | "pass" | "avoid";

export interface MarketRecommendation {
  action: MarketRecommendationAction;
  side: string | null;
  label: string;
}

export interface MarketSignal {
  id: string;
  label: string;
  value: string | number | boolean;
}

export interface HistoricalPatternResult {
  status: "notImplemented" | "available";
  sampleSize: number | null;
  hitRate: number | null;
  roi: number | null;
  confidence: number | null;
  message?: string;
}

export interface MarketAnalysis {
  marketType: MarketEngineType;
  confidence: number;
  marketScore: number;
  baseScore: number;
  finalScore: number;
  historicalConfidence: number | null;
  historicalSample: number | null;
  recommendation: MarketRecommendation;
  reasons: string[];
  signals: MarketSignal[];
  ruleResults: MarketRuleSignal[];
  scoreBreakdown: ScoreBreakdownEntry[];
  auditLog: MarketRuleAuditEntry[];
  riskLevel: MarketRiskLevel;
  line: number | null;
  period: string;
}

export interface MarketAnalysisSnapshot {
  generatedAt: string;
  engineVersion: string;
  marketEngineWeight: number;
  markets: MarketAnalysis[];
}

export interface MarketAnalyzer {
  marketType: MarketEngineType;
  analyze(
    selections: import("@/types/match").MarketSelection[],
    historyProvider: import("./marketHistoryProvider").MarketHistoryProvider
  ): MarketAnalysis | null;
}
