/** PR1: Feature Score category — aligned with core market families. */
export type FeatureScoreCategory =
  | "moneyline"
  | "handicap"
  | "totalGoals"
  | "btts";

export interface FeatureScore {
  id: string;
  category: FeatureScoreCategory;
  score: number;
  weight: number;
  confidence: number;
  reason: string;
  metadata?: Record<string, unknown>;
}

import type { MarketSelection } from "@/types/match";

/**
 * Extensible input for feature collectors.
 * Football-specific fields will be added in later PRs without changing the engine API.
 */
export interface FeatureScoreContext {
  marketSelections?: MarketSelection[];
  metadata?: Record<string, unknown>;
}

export interface FeatureScoreResult {
  features: FeatureScore[];
  totalScore: number;
  confidence: number;
}

/** A collector produces zero or more features from context. */
export type FeatureCollector = (
  context: FeatureScoreContext
) => FeatureScore[];
