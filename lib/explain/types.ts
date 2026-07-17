import type { MarketType } from "@/types/match";

export type RuleExplainStatus = "PASS" | "FAIL" | "SKIPPED";

export interface MarketReason {
  marketType: MarketType;
  label: string;
  reasons: string[];
  evidence: Record<string, string | number | boolean | null>;
}

export interface RuleReason {
  ruleId: string;
  ruleName: string;
  displayName: string;
  status: RuleExplainStatus;
  reason: string;
  influencedCandidates: boolean;
}

export interface ExplainConflict {
  ruleId: string;
  ruleName: string;
  message: string;
  detail: string;
}

export interface ExplainReport {
  summary: string[];
  marketReasons: MarketReason[];
  ruleReasons: RuleReason[];
  conflicts: ExplainConflict[];
  confidenceReason: string;
  evidenceSummary: string[];
}
