import type { MarketEngineType } from "../marketEngineTypes";
import type { MarketOddsRuleResult } from "../marketOddsRules";
import type { MarketSelection } from "@/types/match";

export type MarketRuleSeverity = "info" | "warning" | "critical";

/** Rule output signal (distinct from odds context signals). */
export interface MarketRuleSignal {
  id: string;
  name: string;
  marketType: MarketEngineType | "ALL";
  scoreAdjustment: number;
  confidenceAdjustment: number;
  severity: MarketRuleSeverity;
  reason: string;
  triggered: boolean;
  metadata: Record<string, string | number | boolean | null>;
}

export interface MarketRuleAuditEntry {
  ruleId: string;
  ruleName: string;
  triggered: boolean;
  scoreAdjustment: number;
  confidenceAdjustment: number;
  reason: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface ScoreBreakdownEntry {
  step: string;
  scoreAdjustment: number;
  runningScore: number;
  reason?: string;
}

export interface MarketRuleContext {
  marketType: MarketEngineType;
  selections: MarketSelection[];
  oddsContext: MarketOddsRuleResult;
}

export interface MarketRule {
  id: string;
  name: string;
  evaluate(context: MarketRuleContext): MarketRuleSignal;
}

export interface MarketRuleEngineResult {
  ruleResults: MarketRuleSignal[];
  auditLog: MarketRuleAuditEntry[];
  scoreBreakdown: ScoreBreakdownEntry[];
  baseScore: number;
  finalScore: number;
  totalConfidenceAdjustment: number;
}

export interface RuleHistoricalPatternResult {
  ruleId: string;
  status: "notImplemented" | "available";
  sampleSize: number | null;
  hitRate: number | null;
  roi: number | null;
  confidence: number | null;
  message?: string;
}

export interface RuleHistoricalQuery {
  ruleId: string;
  marketType?: MarketEngineType;
}

export interface MarketRuleHistoryProvider {
  getRuleHistoricalPattern(query: RuleHistoricalQuery): RuleHistoricalPatternResult;
}

export const NOT_IMPLEMENTED_RULE_HISTORICAL_PATTERN: RuleHistoricalPatternResult = {
  ruleId: "",
  status: "notImplemented",
  sampleSize: null,
  hitRate: null,
  roi: null,
  confidence: null,
  message: "Not Implemented",
};
