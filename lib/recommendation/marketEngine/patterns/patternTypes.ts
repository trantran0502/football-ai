import type { MarketEngineType } from "../marketEngineTypes";
import type { MarketOddsRuleResult } from "../marketOddsRules";
import type { MarketRuleSignal } from "../rules/ruleTypes";
import type { MarketSelection } from "@/types/match";

export interface MarketPatternMatch {
  id: string;
  name: string;
  matchedRules: string[];
  matchScore: number;
  confidenceAdjustment: number;
  recommendationAdjustment: number;
  reason: string;
  matched: boolean;
}

export interface MarketPatternDefinition {
  id: string;
  name: string;
  marketType: MarketEngineType | "ALL";
  requiredRules: string[];
  optionalRules: string[];
  minimumScore: number;
  description: string;
  matchScore: number;
  confidenceAdjustment: number;
  recommendationAdjustment: number;
  matches: (context: PatternMatchContext) => boolean;
  buildReason: (context: PatternMatchContext, matchedRules: string[]) => string;
}

export interface PatternMatchContext {
  marketType: MarketEngineType;
  selections: MarketSelection[];
  oddsContext: MarketOddsRuleResult;
  ruleResults: MarketRuleSignal[];
}

export interface PatternAuditEntry {
  patternId: string;
  patternName: string;
  matched: boolean;
  reason: string;
  matchedRules: string[];
  matchScore: number;
  confidenceAdjustment: number;
}

export interface PatternEngineResult {
  matchedPatterns: MarketPatternMatch[];
  patternAudit: PatternAuditEntry[];
  patternScore: number;
  patternAdjustment: number;
  patternConfidenceAdjustment: number;
  scoreBreakdown: import("../rules/ruleTypes").ScoreBreakdownEntry[];
  finalScore: number;
}

export interface PatternHistoricalResult {
  patternId: string;
  status: "notImplemented" | "available";
  sampleSize: number | null;
  hitRate: number | null;
  roi: number | null;
  confidence: number | null;
  message?: string;
}

export interface PatternHistoricalQuery {
  patternId: string;
  marketType?: MarketEngineType;
}

export interface PatternHistoryProvider {
  getPatternHistoricalPattern(query: PatternHistoricalQuery): PatternHistoricalResult;
}

export const NOT_IMPLEMENTED_PATTERN_HISTORICAL: PatternHistoricalResult = {
  patternId: "",
  status: "notImplemented",
  sampleSize: null,
  hitRate: null,
  roi: null,
  confidence: null,
  message: "Not Implemented",
};
