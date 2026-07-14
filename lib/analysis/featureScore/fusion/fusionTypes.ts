import type { FeatureScore } from "@/lib/analysis/featureScore/types";

/** Source-level feature groups used by the fusion layer (distinct from market category). */
export type FusionSourceCategory =
  | "marketOdds"
  | "recentForm"
  | "leagueStrength"
  | "homeAway"
  | "goalsXg"
  | "scoringPattern"
  | "h2h"
  | "squadAvailability"
  | "matchContext";

export interface FusionCategoryDefinition {
  category: FusionSourceCategory;
  label: string;
  idPrefixes: readonly string[];
}

export const FUSION_SOURCE_CATEGORIES: readonly FusionCategoryDefinition[] = [
  { category: "marketOdds", label: "Market Odds", idPrefixes: ["market_odds"] },
  { category: "recentForm", label: "Recent Form", idPrefixes: ["recent_form."] },
  {
    category: "leagueStrength",
    label: "League Strength",
    idPrefixes: ["league_strength."],
  },
  { category: "homeAway", label: "Home / Away", idPrefixes: ["home_away."] },
  { category: "goalsXg", label: "Goals / xG", idPrefixes: ["goals_xg."] },
  {
    category: "scoringPattern",
    label: "BTTS / Over-Under",
    idPrefixes: ["scoring_pattern."],
  },
  { category: "h2h", label: "H2H", idPrefixes: ["h2h."] },
  {
    category: "squadAvailability",
    label: "Squad Availability",
    idPrefixes: ["squad_availability."],
  },
  { category: "matchContext", label: "Match Context", idPrefixes: ["match_context."] },
] as const;

export interface FusionFactorSummary {
  id: string;
  score: number;
  confidence: number;
  weight: number;
  reason: string;
  sourceCategory: FusionSourceCategory | "unknown";
}

export interface FusionCategoryScore {
  category: FusionSourceCategory;
  label: string;
  totalScore: number;
  weightedScore: number;
  confidence: number;
  featureCount: number;
}

export type FusionWarningCode =
  | "too_few_features"
  | "feature_conflict"
  | "low_confidence"
  | "insufficient_data"
  | "small_sample_size";

export interface FusionWarning {
  code: FusionWarningCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface FeatureFusionResult {
  overallScore: number;
  overallConfidence: number;
  categoryScores: FusionCategoryScore[];
  strongestFactors: FusionFactorSummary[];
  weakestFactors: FusionFactorSummary[];
  ignoredFeatures: FusionFactorSummary[];
  warnings: FusionWarning[];
}

export interface FeatureFusionOptions {
  /** Features with confidence below this threshold are ignored in aggregation. Default 0.2. */
  minConfidence?: number;
  /** Minimum active features before emitting a too-few-features warning. Default 5. */
  minActiveFeatures?: number;
  /** Overall confidence below this emits a low-confidence warning. Default 0.35. */
  lowConfidenceThreshold?: number;
  /** Absolute score magnitude used for conflict detection. Default 45. */
  conflictScoreThreshold?: number;
  /** Sample size below this emits a small-sample warning. Default 5. */
  smallSampleSizeThreshold?: number;
}

export type { FeatureScore };
