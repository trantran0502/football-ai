import {
  DECISION_V3_CATALOG_VERSION,
  type DecisionConfig,
} from "@/lib/decision/v3/decisionTypes";

export const DEFAULT_DECISION_V3_CONFIG: DecisionConfig = {
  catalogVersion: DECISION_V3_CATALOG_VERSION,
  weights: {
    ODDS_IMPLIED_VALUE: 1,
    FORM_RECENT_10: 1,
    PROVIDER_CONFIDENCE: 1,
  },
};

export const SUPPORTED_DECISION_V3_EVIDENCE_IDS = [
  "ODDS_IMPLIED_VALUE",
  "FORM_RECENT_10",
  "PROVIDER_CONFIDENCE",
] as const;

export function isDecisionV3ShadowEnabled(): boolean {
  const value = process.env.USE_DECISION_V3_SHADOW?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}
