import type { DailyRecommendationRecord } from "@/lib/dailyRecommendations/dailyRecommendationTypes";

export type PerformanceOutcome = "hit" | "miss" | "pending";

export interface PerformancePeriodStats {
  recommendations: number;
  hits: number;
  misses: number;
  pending: number;
  hitRate: number | null;
  profit: number;
  totalStake: number;
  roi: number | null;
}

export interface PerformanceTotalStats extends PerformancePeriodStats {
  lastUpdatedAt: string | null;
}

export interface PerformanceBucketStats {
  key: string;
  label: string;
  recommendations: number;
  hits: number;
  misses: number;
  pending: number;
  hitRate: number | null;
  profit: number;
  totalStake: number;
  roi: number | null;
}

export interface PerformanceHighlight {
  label: string;
  hitRate: number | null;
  recommendations: number;
  hits: number;
  misses: number;
  roi: number | null;
}

export interface PerformanceStreakStats {
  currentWinStreak: number;
  maxWinStreak: number;
}

export interface PerformanceHitRateTrend {
  periodLabel: string;
  hitRate: number | null;
  previousHitRate: number | null;
  delta: number | null;
  direction: "up" | "down" | "flat" | null;
}

export interface PerformanceRecentPick {
  id: string;
  matchDate: string;
  leagueName: string;
  matchLabel: string;
  market: string;
  recommendation: string;
  playType: string;
  odds: number;
  score: number;
  confidence: number;
  grade: string;
  stars: string;
  outcome: PerformanceOutcome;
  profit: number | null;
  replayId: string | null;
}

export interface EnrichedDailyRecommendation {
  recommendation: DailyRecommendationRecord;
  outcome: PerformanceOutcome;
  hit: boolean | null;
  profit: number | null;
  stake: number;
  stars: string;
  playType: string;
  replayId: string | null;
}

export interface PerformanceCenterReport {
  total: PerformanceTotalStats;
  yesterday: PerformancePeriodStats;
  last7Days: PerformancePeriodStats;
  last30Days: PerformancePeriodStats;
  allTime: PerformancePeriodStats;
  streaks: PerformanceStreakStats;
  bestLeague: PerformanceHighlight | null;
  bestMarket: PerformanceHighlight | null;
  hitRateTrend: PerformanceHitRateTrend;
  byLeague: PerformanceBucketStats[];
  byMarket: PerformanceBucketStats[];
  byGrade: PerformanceBucketStats[];
  recent: PerformanceRecentPick[];
}
