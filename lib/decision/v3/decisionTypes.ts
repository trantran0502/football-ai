export const DECISION_V3_CATALOG_VERSION = "decision-catalog-v3.0";

export type DecisionV3Level = "pass" | "lean" | "bet" | "strong_bet";

export type DecisionV3Confidence = "low" | "medium" | "high";

export type DecisionWeightSource = "runtime" | "fallback" | "shadow";

export interface DecisionCandidate {
  marketType: import("@/types/match").MarketType;
  side: import("@/types/match").MarketSide;
  label: string;
}

export interface DecisionReason {
  evidenceId: string;
  polarity: "support" | "objection";
  summary: string;
}

export interface DecisionBreakdown {
  evidenceId: string;
  score: number;
  confidence: number;
  weight: number;
  contribution: number;
}

export interface DecisionConfig {
  catalogVersion: string;
  weights: Record<string, number>;
}

export interface DecisionOutcome {
  decision: DecisionV3Level;
  confidence: DecisionV3Confidence;
  weightedScore: number;
  candidate: DecisionCandidate | null;
  reasons: DecisionReason[];
  objections: DecisionReason[];
  breakdown: DecisionBreakdown[];
  catalogVersion: string;
  decisionWeightVersion: number | null;
  decisionWeightSource: DecisionWeightSource;
}

export interface DecisionV3Observability {
  decision: DecisionV3Level;
  confidence: DecisionV3Confidence;
  weightedScore: number;
  candidate: DecisionCandidate | null;
  reasonCount: number;
  objectionCount: number;
  decisionWeightVersion: number | null;
  decisionWeightSource: DecisionWeightSource;
}

export interface DecisionV3WeightComparison {
  weightedScoreDiff: number;
  decisionChanged: boolean;
  confidenceChanged: boolean;
}

export interface DecisionV3ShadowContext {
  enabled: boolean;
  collectedAt: string;
  decisionV3: DecisionV3Observability;
  weightComparison?: DecisionV3WeightComparison;
}

export interface AggregateDecisionInput {
  evidence: import("@/lib/evidence/v3/evidenceTypes").EvidenceCollectionResult;
  marketSelections: import("@/types/match").MarketSelection[];
  config?: DecisionConfig;
  decisionWeightVersion?: number | null;
  decisionWeightSource?: DecisionWeightSource;
}
