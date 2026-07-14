import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import type { BettingIntelligenceResult } from "@/lib/betting/intelligenceTypes";
import type {
  RecommendationCandidate,
  RecommendationEngineResult,
} from "@/lib/recommendation/recommendationTypes";
import type { MarketSelection, MarketType } from "@/types/match";

export type DecisionLevel =
  | "PASS"
  | "WATCH"
  | "SMALL BET"
  | "NORMAL BET"
  | "STRONG BET";

export type DecisionScoreTier =
  | "Avoid"
  | "Weak"
  | "Average"
  | "Good"
  | "Excellent";

export interface DecisionFeatureView {
  label: string;
  role: "supporting" | "opposing";
  source: "prediction" | "value" | "risk" | "market";
}

export interface DecisionResult {
  decision: DecisionLevel;
  market: MarketType | null;
  selection: MarketSelection | null;
  confidence: number;
  decisionScore: number;
  decisionScoreTier: DecisionScoreTier;
  valueScore: number;
  riskScore: number;
  expectedValue: number;
  reasons: string[];
  objections: string[];
  supportingFeatures: string[];
  opposingFeatures: string[];
  warnings: string[];
  explanation: DecisionExplanation;
  generatedAt: string;
}

export interface DecisionExplanation {
  supporting: string[];
  opposing: string[];
  summary: string;
}

export interface ValueAssessmentResult {
  valueScore: number;
  expectedValue: number;
  fairOdds: number | null;
  edge: number;
  kellyFraction: number;
  closingLineValue: number | null;
  valueRating: string;
  reasons: string[];
}

export interface RiskAssessmentResult {
  riskScore: number;
  factors: string[];
  warnings: string[];
  objections: string[];
}

export interface ScoredMarketCandidate {
  candidate: RecommendationCandidate;
  compositeScore: number;
  valueScore: number;
  riskScore: number;
  predictionScore: number;
}

export interface BuildDecisionInput {
  fusion: FeatureFusionResult | null;
  bettingIntelligence: BettingIntelligenceResult | null;
  recommendationCandidates: RecommendationCandidate[];
  recommendationResult?: RecommendationEngineResult | null;
  capturedAt?: string;
}

export interface DecisionValidationEntry {
  matchId: string;
  decision: DecisionLevel;
  decisionScore: number;
  profit: number;
  hit: boolean;
  expectedValue: number;
}

export interface DecisionValidationMetrics {
  passRoi: number;
  watchRoi: number;
  betRoi: number;
  strongBetRoi: number;
  decisionDistribution: Record<DecisionLevel, number>;
  decisionScoreBands: Record<DecisionScoreTier, { count: number; roi: number; hitRate: number }>;
  sampleSize: number;
}

export interface AdminDecisionMetrics {
  passPercent: number;
  watchPercent: number;
  betPercent: number;
  strongBetPercent: number;
  averageDecisionScore: number;
  scoreDistribution: Record<DecisionScoreTier, number>;
  sampleSize: number;
}

export interface ReplayDecisionSnapshot {
  decision: DecisionResult;
  inputs: {
    predictionScore: number;
    valueScore: number;
    riskScore: number;
    candidateCount: number;
  };
  scoredCandidates: Array<{
    marketType: MarketType;
    side: string;
    compositeScore: number;
    valueScore: number;
    riskScore: number;
  }>;
}

export type { FeatureFusionResult, BettingIntelligenceResult, RecommendationCandidate };
