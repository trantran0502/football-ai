import type { BetResult } from "@/lib/backtest/types";
import type { DecisionValidationEntry } from "@/lib/decision/decisionTypes";
import type { DecisionValidationMetrics } from "@/lib/decision/decisionTypes";
import type { MatchResult } from "@/lib/database/matchSchema";
import type {
  RecommendationCandidate,
  RecommendationEngineResult,
  RecommendationLevel,
} from "@/lib/recommendation/recommendationTypes";

export type ValidationMarketKey = "Moneyline" | "Handicap" | "OverUnder" | "BTTS";

export interface RecommendationValidationEvaluation {
  result: BetResult;
  profit: number;
  hit: boolean;
  odds: number;
  confidence: RecommendationLevel;
  stake: number;
  expectedValue: number;
  score: number;
}

export interface RecommendationValidationEntry {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  candidate: RecommendationCandidate;
  evaluation: RecommendationValidationEvaluation;
  marketKey: ValidationMarketKey;
  ruleKeys: string[];
}

export interface ValidationMetricBucket {
  sampleSize: number;
  wins: number;
  losses: number;
  pushes: number;
  halfWins: number;
  halfLoses: number;
  hitRate: number;
  roi: number;
  averageOdds: number;
  averageConfidence: number;
  totalProfit: number;
}

export interface ValidationReport {
  totalMatches: number;
  totalRecommendations: number;
  hitRate: number;
  roi: number;
  byMarket: Record<ValidationMarketKey, ValidationMetricBucket>;
  byRule: Record<string, ValidationMetricBucket>;
  byFeature: Record<string, ValidationMetricBucket>;
  confidenceDistribution: Record<RecommendationLevel, number>;
  recommendationsToDisable: string[];
  recommendationsToIncreaseWeight: string[];
}

export interface ValidationMatchInput {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  result: MatchResult;
  recommendation: RecommendationEngineResult | null;
}

export interface RecommendationValidationResult {
  entries: RecommendationValidationEntry[];
  report: ValidationReport;
  decisionEntry?: DecisionValidationEntry | null;
  decisionMetrics?: DecisionValidationMetrics | null;
}

export type {
  BetResult,
  MatchResult,
  RecommendationCandidate,
  RecommendationEngineResult,
  DecisionValidationEntry,
  DecisionValidationMetrics,
};
