import type { BetaCandidate } from "@/lib/beta/types";
import type { BettingIntelligenceResult } from "@/lib/betting/intelligenceTypes";
import type { DecisionResult } from "@/lib/decision/decisionTypes";
import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import type { RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";
import type {
  AsianModifier,
  MarketFamily,
  MarketPeriod,
  MarketSelection,
  MarketSide,
  MarketType,
  MatchData,
  SettlementAtBoundary,
} from "@/types/match";
import type { AnalysisField } from "@/lib/analysis/analysisField";

/** 市場唯一識別（同 title + period + type 為一組）。 */
export type MarketId = string;

/** Feature Builder 輸出：單一 selection 的分析特徵。 */
export interface AnalysisFeature {
  marketId: MarketId;
  marketType: MarketType;
  marketFamily: MarketFamily;
  title: string;
  period: MarketPeriod;
  side: MarketSide;
  decimalOdds: number;
  impliedProbability: number;
  line: number | null;
  modifier: AsianModifier | null;
  settlement: SettlementAtBoundary | null;
  handicap: number | null;
  rawLine: string | null;
  label?: string | null;
}

export type InterpretationStrength = "low" | "medium" | "high";
export type OverBias = "over" | "under" | "neutral";

export interface BaseInterpretation {
  marketId: MarketId;
  marketType: MarketType;
  title: string;
  period: MarketPeriod;
}

export interface MoneylineInterpretation extends BaseInterpretation {
  kind: "moneyline";
  expectedWinner: AnalysisField<"home" | "away" | "draw">;
  strength: AnalysisField<InterpretationStrength>;
  probabilities: AnalysisField<{
    home: number;
    draw: number;
    away: number;
  }>;
}

export interface HandicapInterpretation extends BaseInterpretation {
  kind: "handicap";
  expectedMargin: AnalysisField<number>;
  favoredSide: AnalysisField<"home" | "away">;
  line: AnalysisField<number | null>;
  strength: AnalysisField<InterpretationStrength>;
}

export interface TotalGoalsInterpretation extends BaseInterpretation {
  kind: "totalGoals";
  expectedGoals: AnalysisField<number>;
  lean: AnalysisField<OverBias>;
  line: AnalysisField<number | null>;
}

export interface BttsInterpretation extends BaseInterpretation {
  kind: "btts";
  bothTeamsLikely: AnalysisField<boolean>;
  yesProbability: AnalysisField<number>;
  noProbability: AnalysisField<number>;
}

export interface GenericInterpretation extends BaseInterpretation {
  kind: "generic";
  summary: AnalysisField<string>;
}

export type MarketInterpretation =
  | MoneylineInterpretation
  | HandicapInterpretation
  | TotalGoalsInterpretation
  | BttsInterpretation
  | GenericInterpretation;

export interface NotImplementedAnalysis {
  status: "notImplemented";
  reason: string;
}

export type MarketAnalysis = NotImplementedAnalysis;
export type CombinedAnalysis = NotImplementedAnalysis;

export type CrossMarketRuleStatus = "PASS" | "FAIL" | "SKIPPED";

export type CrossMarketOverallStatus = "COMPLETE" | "PARTIAL" | "INSUFFICIENT";

export interface CrossMarketRuleResult {
  status: CrossMarketRuleStatus;
  reason: string;
}

export interface CrossMarketValidation {
  status: CrossMarketOverallStatus;
  availableMarkets: number;
  executedRules: number;
  skippedRules: number;
  coverageLabel: string;
  moneylineHandicap: CrossMarketRuleResult;
  handicapTotalGoals: CrossMarketRuleResult;
  totalGoalsBtts: CrossMarketRuleResult;
}

export interface AnalysisCandidate {
  marketId: MarketId;
  marketType: MarketType;
  title: string;
  period: MarketPeriod;
  side: MarketSide;
  reason: string[];
  confidence: "low" | "medium" | "high";
}

export type CandidateConfidence = AnalysisCandidate["confidence"];

export interface AnalysisEngineResult {
  features: AnalysisFeature[];
  interpretations: MarketInterpretation[];
  marketAnalysis: MarketAnalysis;
  combinedAnalysis: CombinedAnalysis;
  candidates: AnalysisCandidate[];
}

export interface BetaRecommendationSection {
  enabled: boolean;
  candidates: BetaCandidate[];
  message: string;
}

export interface RecommendationSection {
  enabled: boolean;
  fusion: FeatureFusionResult | null;
  result: RecommendationEngineResult | null;
  message: string;
}

import type { MatchTeamProfilesSnapshot, TeamProfileTeamDiagnostic } from "@/lib/teamProfile/teamProfileTypes";
import type { WeightConfigSnapshotMetadata } from "@/lib/recommendation/weightConfigTypes";

export interface AnalysisReportContext {
  profileDiagnostics?: TeamProfileTeamDiagnostic[];
}

/** 端到端分析報告 */
export interface AnalysisReport {
  match: MatchData;
  markets: MarketSelection[];
  interpretations: MarketInterpretation[];
  crossMarketValidation: CrossMarketValidation;
  candidates: AnalysisCandidate[];
  betaRecommendation: BetaRecommendationSection;
  recommendation: RecommendationSection;
  bettingIntelligence: BettingIntelligenceResult | null;
  decision: DecisionResult | null;
  teamProfiles?: MatchTeamProfilesSnapshot | null;
  weightConfig?: WeightConfigSnapshotMetadata | null;
  analysisContext?: AnalysisReportContext;
}

export type MarketSelectionInput = MarketSelection[];
