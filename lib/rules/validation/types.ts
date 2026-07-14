import type { MatchResult } from "@/lib/database/matchSchema";
import type { CrossMarketRuleOutput, RuleName } from "@/lib/rules/types";

/** 單場比賽上，Rule 是否通過 Validation 的判定結果。 */
export interface RuleResult {
  ruleName: RuleName;
  passed: boolean;
  reason: string;
  evidence: RuleEvidence;
}

export interface RuleEvidence {
  matchId: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  ruleOutput: CrossMarketRuleOutput | null;
  matchResult: MatchResult | null;
}

/** 單一 Rule 對歷史樣本的彙總驗證結果。 */
export interface RuleValidationSummary {
  ruleName: RuleName;
  sampleSize: number;
  passCount: number;
  failCount: number;
  passRate: number;
  examples: RuleResult[];
}

/** 一次執行全部 Rule 的驗證報告。 */
export interface RuleValidationReport {
  validatedAt: string;
  mode: RuleValidationMode;
  rules: RuleValidationSummary[];
}

export type RuleValidationMode = "dryRun" | "evaluate";
