import type { MarketSide, MarketType } from "@/types/match";

export const RECOMMENDATION_COMPARISON_REPLAY_SCHEMA =
  "recommendation-comparison-v1" as const;

export type ComparableDirection =
  | "home"
  | "away"
  | "draw"
  | "over"
  | "under"
  | "pass"
  | "neutral";

export interface ComparableRecommendation {
  marketType: MarketType | null;
  side: MarketSide | null;
  direction: ComparableDirection;
  confidenceLevel: string;
  weightedScore: number;
  topReasons: string[];
  topObjections: string[];
  globalPass: boolean;
}

export interface RecommendationComparisonAgreement {
  agreement: boolean;
  directionAgreement: boolean;
  marketAgreement: boolean;
  confidenceAgreement: boolean;
  weightedScoreDiff: number;
  topReasonOverlap: number;
  topReasonConflict: number;
  candidateChanged: boolean;
}

export interface RecommendationComparison {
  legacyRecommendation: ComparableRecommendation;
  decisionRecommendation: ComparableRecommendation;
  agreement: RecommendationComparisonAgreement;
  weightedScoreDiff: number;
  confidenceDiff: number;
  candidateDiff: boolean;
  reasonOverlap: number;
  reasonConflict: number;
}

export interface RecommendationComparisonObservability {
  agreement: boolean;
  directionAgreement: boolean;
  confidenceAgreement: boolean;
  weightedScoreDiff: number;
  candidateChanged: boolean;
}

export interface RecommendationComparisonReplaySnapshot {
  schemaVersion: typeof RECOMMENDATION_COMPARISON_REPLAY_SCHEMA;
  collectedAt: string;
  fixtureKey: string;
  runId: string;
  comparison: RecommendationComparison;
}

export interface RecommendationComparisonShadowContext {
  enabled: boolean;
  collectedAt: string;
  recommendationComparison: RecommendationComparisonObservability;
  replaySnapshot: RecommendationComparisonReplaySnapshot;
}
