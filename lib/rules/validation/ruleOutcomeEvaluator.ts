import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { CrossMarketRuleOutput, Rule } from "@/lib/rules/types";
import type { RuleResult } from "@/lib/rules/validation/types";

/**
 * 比對 Rule 輸出與歷史賽果，判定單場是否通過。
 * 實際判定邏輯留待未來實作；目前僅提供介面與 stub。
 */
export interface RuleOutcomeEvaluator {
  evaluate(
    rule: Rule,
    match: HistoricalMatchRecord,
    ruleOutput: CrossMarketRuleOutput | null
  ): RuleResult;
}

function buildEvidence(
  match: HistoricalMatchRecord,
  ruleOutput: CrossMarketRuleOutput | null
): RuleResult["evidence"] {
  return {
    matchId: match.id,
    date: match.date,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    ruleOutput,
    matchResult: match.result,
  };
}

/** 預設 stub：尚未實作賽果對照，一律標記為未通過。 */
export const NOT_IMPLEMENTED_RULE_OUTCOME_EVALUATOR: RuleOutcomeEvaluator = {
  evaluate(rule, match, ruleOutput) {
    return {
      ruleName: rule.name,
      passed: false,
      reason: "Rule outcome evaluator not implemented.",
      evidence: buildEvidence(match, ruleOutput),
    };
  },
};
