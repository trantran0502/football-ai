export { explainAnalysis } from "@/lib/explain/explainEngine";
export {
  buildBttsReason,
  buildConfidenceReason,
  buildConflicts,
  buildExplainInputs,
  buildHandicapReason,
  buildMarketReasons,
  buildMoneylineReason,
  buildRuleReasons,
  buildTotalGoalsReason,
} from "@/lib/explain/reasonBuilder";
export { buildSummary } from "@/lib/explain/summaryBuilder";
export type {
  ExplainConflict,
  ExplainReport,
  MarketReason,
  RuleExplainStatus,
  RuleReason,
} from "@/lib/explain/types";
