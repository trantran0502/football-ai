import type { BetResult } from "@/lib/backtest/types";
import type { MatchResult } from "@/lib/database/matchSchema";
import type { TeamDataPackage } from "@/lib/providers/free/types";
import type { MarketSelection, MarketSide, MarketType } from "@/types/match";

export type BetaConfidenceLevel = "low" | "medium" | "high";

export type BetaRecommendationStatus = "PENDING" | "VERIFIED";

export interface BetaCandidate {
  marketType: MarketType;
  title: string;
  side: MarketSide;
  rawLine: string | null;
  odds: number;
  reasons: string[];
  supportingEvidence: string[];
  opposingEvidence: string[];
  rulesUsed: string[];
  confidenceLevel: BetaConfidenceLevel;
  modelVersion: string;
  createdAt: string;
}

export interface BetaRecommendationRecord {
  id: string;
  matchRecordId: string;
  modelVersion: string;
  recommendedAt: string;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  candidate: BetaCandidate;
  rawOdds: string;
  marketSelections: MarketSelection[];
  teamData: TeamDataPackage | null;
  rulesUsed: string[];
  status: BetaRecommendationStatus;
  finalScore: MatchResult | null;
  settlement: BetResult | null;
  profit: number | null;
  hit: boolean | null;
  verifiedAt: string | null;
}

export interface BetaDashboardStats {
  modelVersion: string;
  totalRecommendations: number;
  verifiedCount: number;
  pendingCount: number;
  wins: number;
  losses: number;
  pushes: number;
  halfWins: number;
  halfLoses: number;
  hitRate: number;
  roi: number;
  averageOdds: number;
  marketTypeHitRates: Record<string, { hits: number; total: number; rate: number }>;
  ruleHitRates: Record<string, { hits: number; total: number; rate: number }>;
  last20: { hits: number; total: number; rate: number; roi: number };
  last50: { hits: number; total: number; rate: number; roi: number };
  sampleWarning: string;
}

export interface RollingEvaluationReport {
  evaluatedAt: string;
  modelVersion: string;
  windowSize: number;
  hitRate: number;
  roi: number;
  bestMarketType: string | null;
  worstMarketType: string | null;
  bestRule: string | null;
  worstRule: string | null;
  suggestDownweightRules: string[];
  suggestPauseRules: string[];
  notes: string[];
}

export interface BetaGenerationResult {
  candidates: BetaCandidate[];
  message: string;
}
