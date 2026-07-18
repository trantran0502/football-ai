import type { BetResult } from "@/lib/backtest/types";
import type {
  AnalysisSnapshot,
  HistoricalMatchRecord,
  MatchResult,
  MatchStatus,
  MatchVerificationResult,
} from "@/lib/database/matchSchema";
import type {
  BetaCandidate,
  BetaRecommendationRecord,
  BetaRecommendationStatus,
  RollingEvaluationReport,
} from "@/lib/beta/types";
import type { TeamDataPackage } from "@/lib/providers/free/types";
import type { AnalysisCandidate } from "@/lib/analysis/types";
import type { MarketSelection } from "@/types/match";
import type {
  RecommendationLearningMarketOutcome,
  RecommendationLearningRecord,
} from "@/lib/recommendation/recommendationLearningTypes";
import type { RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";
import type { ReplayProviderRecommendationDiagnostic } from "@/lib/replay/replayTypes";
import type { FeatureProviderKey } from "@/lib/providers/registry/types";
import type { WeightConfigStatus } from "@/lib/recommendation/weightConfigTypes";

export interface MatchRecordRow {
  id: string;
  match_date: string;
  league: string;
  home_team: string;
  away_team: string;
  status: string;
  raw_odds: string;
  market_selections: MarketSelection[];
  candidates: AnalysisCandidate[];
  analysis_snapshot: AnalysisSnapshot | null;
  result: MatchResult | null;
  verification_result: MatchVerificationResult | null;
  legacy_date: string | null;
  fixture_id: number | null;
  league_id: number | null;
  season: number | null;
  home_team_id: number | null;
  away_team_id: number | null;
  source: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export interface MatchRecordInsert {
  id: string;
  match_date: string;
  league: string;
  home_team: string;
  away_team: string;
  status: MatchStatus;
  raw_odds: string;
  market_selections: MarketSelection[];
  candidates: AnalysisCandidate[];
  analysis_snapshot: AnalysisSnapshot | null;
  result: MatchResult | null;
  verification_result: MatchVerificationResult | null;
  legacy_date: string | null;
  fixture_id?: number | null;
  league_id?: number | null;
  season?: number | null;
  home_team_id?: number | null;
  away_team_id?: number | null;
  source: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export interface BetaRecommendationRow {
  id: string;
  match_record_id: string;
  model_version: string;
  recommended_at: string;
  home_team: string;
  away_team: string;
  match_date: string;
  status: string;
  settlement: BetResult | null;
  profit: number | null;
  hit: boolean | null;
  verified_at: string | null;
  candidate: BetaCandidate;
  raw_odds: string;
  market_selections: MarketSelection[];
  team_data: TeamDataPackage | null;
  rules_used: string[];
  final_score: MatchResult | null;
  source: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export interface BetaRecommendationInsert {
  id: string;
  match_record_id: string;
  model_version: string;
  recommended_at: string;
  home_team: string;
  away_team: string;
  match_date: string;
  status: BetaRecommendationStatus;
  settlement: BetResult | null;
  profit: number | null;
  hit: boolean | null;
  verified_at: string | null;
  candidate: BetaCandidate;
  raw_odds: string;
  market_selections: MarketSelection[];
  team_data: TeamDataPackage | null;
  rules_used: string[];
  final_score: MatchResult | null;
  source: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export interface BetaRollingReportRow {
  id: string;
  model_version: string;
  evaluated_at: string;
  window_size: number;
  report: RollingEvaluationReport;
  source: string;
  schema_version: number;
  created_at: string;
}

export interface BetaRollingReportInsert {
  model_version: string;
  evaluated_at: string;
  window_size: number;
  report: RollingEvaluationReport;
  source: string;
  schema_version: number;
  created_at?: string;
}

export interface RecommendationLearningRow {
  id: string;
  match_record_id: string;
  fixture_id: number | null;
  recommendation: RecommendationEngineResult | null;
  actual_result: MatchResult;
  hit: boolean;
  provider_diagnostics: ReplayProviderRecommendationDiagnostic[];
  provider_overall_confidence: number | null;
  market_outcomes: RecommendationLearningMarketOutcome[];
  total_profit: number;
  total_stake: number;
  verified_at: string;
  match_date: string;
  league: string;
  home_team: string;
  away_team: string;
  source: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export interface RecommendationLearningInsert {
  id: string;
  match_record_id: string;
  fixture_id?: number | null;
  recommendation?: RecommendationEngineResult | null;
  actual_result: MatchResult;
  hit: boolean;
  provider_diagnostics?: ReplayProviderRecommendationDiagnostic[];
  provider_overall_confidence?: number | null;
  market_outcomes?: RecommendationLearningMarketOutcome[];
  total_profit?: number;
  total_stake?: number;
  verified_at: string;
  match_date: string;
  league: string;
  home_team: string;
  away_team: string;
  source: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export interface WeightConfigVersionRow {
  id: string;
  version: number;
  status: WeightConfigStatus;
  provider_weights: Record<FeatureProviderKey, number>;
  market_blend_weight: number;
  source_report_snapshot: Record<string, unknown>;
  created_by: string;
  created_at: string;
  applied_at: string | null;
  archived_at: string | null;
}

export interface WeightConfigVersionInsert {
  id?: string;
  version: number;
  status: WeightConfigStatus;
  provider_weights: Record<FeatureProviderKey, number>;
  market_blend_weight: number;
  source_report_snapshot?: Record<string, unknown>;
  created_by?: string;
  created_at?: string;
  applied_at?: string | null;
  archived_at?: string | null;
}

export type Database = {
  public: {
    Tables: {
      match_records: {
        Row: MatchRecordRow;
        Insert: MatchRecordInsert;
        Update: Partial<MatchRecordInsert>;
        Relationships: [];
      };
      beta_recommendations: {
        Row: BetaRecommendationRow;
        Insert: BetaRecommendationInsert;
        Update: Partial<BetaRecommendationInsert>;
        Relationships: [
          {
            foreignKeyName: "beta_recommendations_match_record_id_fkey";
            columns: ["match_record_id"];
            isOneToOne: false;
            referencedRelation: "match_records";
            referencedColumns: ["id"];
          },
        ];
      };
      beta_rolling_reports: {
        Row: BetaRollingReportRow;
        Insert: BetaRollingReportInsert;
        Update: Partial<BetaRollingReportInsert>;
        Relationships: [];
      };
      recommendation_learning: {
        Row: RecommendationLearningRow;
        Insert: RecommendationLearningInsert;
        Update: Partial<RecommendationLearningInsert>;
        Relationships: [
          {
            foreignKeyName: "recommendation_learning_match_record_id_fkey";
            columns: ["match_record_id"];
            isOneToOne: true;
            referencedRelation: "match_records";
            referencedColumns: ["id"];
          },
        ];
      };
      weight_config_versions: {
        Row: WeightConfigVersionRow;
        Insert: WeightConfigVersionInsert;
        Update: Partial<WeightConfigVersionInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
