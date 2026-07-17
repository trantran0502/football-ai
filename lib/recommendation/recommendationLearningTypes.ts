import type { MatchResult } from "@/lib/database/matchSchema";
import type { RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";
import type { ReplayProviderRecommendationDiagnostic } from "@/lib/replay/replayTypes";
import type { RecommendationLevel } from "@/lib/recommendation/recommendationTypes";
import type { EvidenceValidationRecord } from "@/lib/evidence/evidenceValidation";

export type RecommendationLearningMarketKey = "1X2" | "AH" | "O/U" | "BTTS";

export interface RecommendationLearningMarketOutcome {
  marketKey: RecommendationLearningMarketKey;
  hit: boolean;
  profit: number;
  stake: number;
  confidence: RecommendationLevel;
  result: string;
}

export interface RecommendationLearningRecord {
  id: string;
  matchRecordId: string;
  fixtureId: number | null;
  recommendation: RecommendationEngineResult | null;
  actualResult: MatchResult;
  hit: boolean;
  providerDiagnostics: ReplayProviderRecommendationDiagnostic[];
  providerOverallConfidence: number | null;
  marketOutcomes: RecommendationLearningMarketOutcome[];
  totalProfit: number;
  totalStake: number;
  verifiedAt: string;
  matchDate: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  createdAt: string;
  updatedAt: string;
  evidenceValidation: EvidenceValidationRecord | null;
}

export interface RecommendationProviderLearningStats {
  providerKey: string;
  usageCount: number;
  hitCount: number;
  hitRate: number;
  roi: number;
  averageConfidence: number;
  totalProfit: number;
  totalStake: number;
}

export interface RecommendationMarketLearningStats {
  marketKey: RecommendationLearningMarketKey;
  usageCount: number;
  hitCount: number;
  hitRate: number;
  roi: number;
  averageConfidence: number;
  totalProfit: number;
  totalStake: number;
}

export interface RecommendationLearningWindowStats {
  windowSize: number | "all";
  sampleSize: number;
  hitRate: number;
  roi: number;
  providerRanking: RecommendationProviderLearningStats[];
  marketStats: RecommendationMarketLearningStats[];
}

export interface RecommendationLearningDashboardData {
  generatedAt: string;
  totalRecords: number;
  overall: RecommendationLearningWindowStats;
  last100: RecommendationLearningWindowStats;
  last500: RecommendationLearningWindowStats;
  recentRecords: RecommendationLearningRecord[];
}
