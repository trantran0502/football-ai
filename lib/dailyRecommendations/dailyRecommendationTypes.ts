import type { AnalysisSnapshot } from "@/lib/database/matchSchema";

export const DAILY_RECOMMENDATION_SCORE_THRESHOLD = 60;
export const DAILY_RECOMMENDATION_CONFIDENCE_THRESHOLD = 55;
export const DAILY_RECOMMENDATION_MAX_PICKS = 3;

export interface DailyRecommendationRecord {
  id: string;
  schedulerRun: string;
  fixtureId: number | null;
  matchDate: string;
  kickoffTime: string | null;
  leagueId: number | null;
  leagueName: string;
  country: string;
  homeTeam: string;
  awayTeam: string;
  market: string;
  recommendation: string;
  odds: number;
  confidence: number;
  score: number;
  rank: number;
  grade: string;
  reasoning: string[];
  analysisSnapshot: AnalysisSnapshot | null;
  matchRecordId: string;
  createdAt: string;
}

export interface DailyRecommendationGrade {
  grade: string;
  stars: string;
  recommended: boolean;
}
