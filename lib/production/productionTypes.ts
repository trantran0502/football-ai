import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";
import type {
  RecommendationValidationEntry,
  ValidationMetricBucket,
  ValidationReport,
} from "@/lib/validation/validationTypes";
import type { RecommendationLevel } from "@/lib/recommendation/recommendationTypes";

export interface ProductionFixture {
  matchDate: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  rawOdds: string;
}

export interface ProductionResultUpdate {
  matchId: string;
  fullTimeHomeGoals: number;
  fullTimeAwayGoals: number;
  halfTimeHomeGoals: number;
  halfTimeAwayGoals: number;
}

export interface DailyPipelineItemResult {
  fixture: ProductionFixture;
  status: "created" | "duplicate" | "failed";
  matchId?: string;
  error?: string;
}

export interface DailyPipelineResult {
  runDate: string;
  processed: number;
  created: number;
  duplicates: number;
  failed: number;
  items: DailyPipelineItemResult[];
}

export interface ResultPipelineItemResult {
  matchId: string;
  status: "verified" | "failed" | "skipped" | "not_found";
  error?: string;
}

export interface ResultPipelineResult {
  processed: number;
  verified: number;
  failed: number;
  skipped: number;
  items: ResultPipelineItemResult[];
}

export interface ConfidenceHitRatePoint {
  confidence: RecommendationLevel;
  sampleSize: number;
  hitRate: number;
  roi: number;
}

export interface ProductionDashboard {
  totalMatches: number;
  totalRecommendations: number;
  hitRate: number;
  roi: number;
  byMarket: ValidationReport["byMarket"];
  byRule: ValidationReport["byRule"];
  byLeague: Record<string, ValidationMetricBucket>;
  byConfidence: Record<RecommendationLevel, ValidationMetricBucket>;
  byFeature: Record<string, ValidationMetricBucket>;
  confidenceVsHitRate: ConfidenceHitRatePoint[];
  settlementCounts: {
    wins: number;
    losses: number;
    pushes: number;
    halfWins: number;
    halfLoses: number;
  };
}

export interface WeightReport {
  highRoiFeatures: string[];
  lowRoiFeatures: string[];
  invalidRules: string[];
  bestMarkets: string[];
  generatedAt: string;
}

export interface LearningReport {
  increaseWeightFeatures: string[];
  decreaseWeightFeatures: string[];
  disableRules: string[];
  suggestedNewRules: string[];
  generatedAt: string;
}

export interface RecommendationTrace {
  matchId: string;
  matchDate: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  fusion: FeatureFusionResult | null;
  recommendation: RecommendationEngineResult | null;
  supportingFeatures: string[];
  validationEntries: RecommendationValidationEntry[];
  hitRate: number;
  roi: number;
}

export interface ProductionValidationSummary {
  dashboard: ProductionDashboard;
  weightReport: WeightReport;
  learningReport: LearningReport;
  traces: RecommendationTrace[];
}

export type { HistoricalMatchRecord, ValidationMetricBucket, ValidationReport };
