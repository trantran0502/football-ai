import type { AdminDecisionMetrics } from "@/lib/decision/decisionTypes";
import type { DecisionValidationMetrics } from "@/lib/decision/decisionTypes";
import type { LearningEngineReport } from "@/lib/learning/learningTypes";
import type { ValidationMetricBucket } from "@/lib/validation/validationTypes";
import type { ValidationMarketKey } from "@/lib/validation/validationTypes";

export type AdminErrorCategory =
  | "api"
  | "google"
  | "parser"
  | "provider"
  | "cache"
  | "validation"
  | "scheduler";

export interface AdminErrorLogEntry {
  id: string;
  category: AdminErrorCategory;
  message: string;
  context: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminSystemStatus {
  apiFootball: {
    usedToday: number;
    remainingToday: number;
    minuteUsed: number;
    minuteLimit: number;
  };
  googleGemini: {
    searchesToday: number;
    remainingToday: number | null;
    dailyLimit: number | null;
  };
  supabase: {
    configured: boolean;
    connected: boolean;
    tables: {
      match_records: number;
      beta_recommendations: number;
      beta_rolling_reports: number;
      admin_daily_summaries: number;
    };
  };
  cache: {
    hitRate: number;
    hits: number;
    misses: number;
  };
  lastSyncAt: string | null;
}

export interface AdminAnalysisStatus {
  analyzedToday: number;
  recommendedToday: number;
  passToday: number;
  pendingCount: number;
  verifiedCount: number;
}

export interface AdminPerformanceMetrics {
  roiToday: number;
  roi7d: number;
  roi30d: number;
  roiTotal: number;
  hitRateTotal: number;
  totalRecommendations: number;
}

export interface AdminAiSuggestions {
  increaseWeightFeatures: string[];
  decreaseWeightFeatures: string[];
  disableRules: string[];
  suggestedNewRules: string[];
}

export interface AdminDailySummaryPayload {
  summaryDate: string;
  analyzedCount: number;
  recommendedCount: number;
  passCount: number;
  verifiedCount: number;
  recommendationCount: number;
  hitRate: number;
  roi: number;
  byMarket: Record<ValidationMarketKey, ValidationMetricBucket>;
  byLeague: Record<string, ValidationMetricBucket>;
  byFeature: Record<string, ValidationMetricBucket>;
  byRule: Record<string, ValidationMetricBucket>;
  aiSuggestions: AdminAiSuggestions;
}

export interface AdminBettingIntelligenceMetrics {
  valueBetToday: number;
  averageExpectedValue: number;
  averageClosingLineValue: number | null;
  bestMarket: string | null;
  bestBookmaker: string | null;
  bestLeague: string | null;
  sampleSize: number;
}

export interface AdminDashboardResponse {
  generatedAt: string;
  system: AdminSystemStatus;
  analysis: AdminAnalysisStatus;
  performance: AdminPerformanceMetrics;
  bettingIntelligence: AdminBettingIntelligenceMetrics;
  decision: AdminDecisionMetrics & {
    validation: DecisionValidationMetrics;
  };
  byMarket: Record<ValidationMarketKey, ValidationMetricBucket>;
  byLeague: Record<string, ValidationMetricBucket>;
  byFeature: Record<string, ValidationMetricBucket>;
  byRule: Record<string, ValidationMetricBucket>;
  aiSuggestions: AdminAiSuggestions;
  learning: LearningEngineReport;
  recentErrors: AdminErrorLogEntry[];
}

export interface AdminSystemSnapshotPayload {
  system: AdminSystemStatus;
  analysis: Pick<
    AdminAnalysisStatus,
    "pendingCount" | "verifiedCount"
  >;
}
