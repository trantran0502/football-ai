export {
  DEFAULT_DECISION_V3_CONFIG,
  SUPPORTED_DECISION_V3_EVIDENCE_IDS,
  isDecisionV3ShadowEnabled,
} from "@/lib/decision/v3/decisionConfig";
export {
  aggregateDecision,
  buildDecisionV3Observability,
} from "@/lib/decision/v3/decisionEngine";
export { runDecisionV3ShadowIfEnabled } from "@/lib/decision/v3/decisionShadowMode";
export {
  buildDecisionConfigFromResolvedWeights,
  buildFixedDecisionConfig,
  resolveDecisionEvidenceWeights,
} from "@/lib/decision/v3/decisionWeightLoader";
export type {
  AggregateDecisionInput,
  DecisionBreakdown,
  DecisionCandidate,
  DecisionConfig,
  DecisionOutcome,
  DecisionReason,
  DecisionV3Confidence,
  DecisionV3Level,
  DecisionV3Observability,
  DecisionV3ShadowContext,
  DecisionV3WeightComparison,
  DecisionWeightSource,
} from "@/lib/decision/v3/decisionTypes";
