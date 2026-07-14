import type { CandidateConfidence } from "@/lib/analysis/types";
import type { MatchResult } from "@/lib/database/matchSchema";

/** 單注結算結果 */
export type BetResult = "WIN" | "LOSE" | "PUSH" | "HALF_WIN" | "HALF_LOSE";

export interface GoalContext {
  homeGoals: number;
  awayGoals: number;
  totalGoals: number;
}

export interface BetEvaluation {
  result: BetResult;
  profit: number;
  hit: boolean;
  recommendationSucceeded: boolean;
  odds: number;
  confidence: CandidateConfidence;
  stake: number;
}

export interface BacktestMatch {
  id: string;
  date: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  marketSelections: import("@/types/match").MarketSelection[];
  result: MatchResult;
}

export interface CandidateBacktestEntry {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  candidate: import("@/lib/analysis/types").AnalysisCandidate;
  evaluation: BetEvaluation;
}

export interface BacktestStatistics {
  totalMatches: number;
  totalBets: number;
  wins: number;
  losses: number;
  pushes: number;
  halfWins: number;
  halfLoses: number;
  winRate: number;
  roi: number;
  totalProfit: number;
  averageOdds: number;
  averageConfidence: number;
}

export interface BacktestEngineResult {
  entries: CandidateBacktestEntry[];
  statistics: BacktestStatistics;
}

export interface SettlementTestCase {
  name: string;
  selection: import("@/types/match").MarketSelection;
  result: MatchResult;
  expected: BetResult;
}
