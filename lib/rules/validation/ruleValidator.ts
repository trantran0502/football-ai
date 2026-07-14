import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import { getAllRegisteredRules } from "@/lib/rules/ruleRegistry";
import type { Rule } from "@/lib/rules/types";
import {
  NOT_IMPLEMENTED_RULE_OUTCOME_EVALUATOR,
  type RuleOutcomeEvaluator,
} from "@/lib/rules/validation/ruleOutcomeEvaluator";
import type {
  RuleResult,
  RuleValidationMode,
  RuleValidationReport,
  RuleValidationSummary,
} from "@/lib/rules/validation/types";

export interface RuleValidationOptions {
  /** dryRun：只計算樣本數，不執行 evaluator。evaluate：執行完整驗證流程。 */
  mode?: RuleValidationMode;
  maxExamples?: number;
  evaluator?: RuleOutcomeEvaluator;
}

const DEFAULT_MAX_EXAMPLES = 5;

function selectValidationSample(
  rule: Rule,
  historicalMatches: HistoricalMatchRecord[]
): HistoricalMatchRecord[] {
  return historicalMatches.filter(
    (match) => rule.canApply(match) && match.result !== null
  );
}

function buildDryRunSummary(
  rule: Rule,
  sample: HistoricalMatchRecord[]
): RuleValidationSummary {
  return {
    ruleName: rule.name,
    sampleSize: sample.length,
    passCount: 0,
    failCount: 0,
    passRate: 0,
    examples: [],
  };
}

function buildEvaluateSummary(
  rule: Rule,
  sample: HistoricalMatchRecord[],
  evaluator: RuleOutcomeEvaluator,
  maxExamples: number
): RuleValidationSummary {
  const results: RuleResult[] = [];

  for (const match of sample) {
    const ruleOutput = rule.evaluate(match);
    results.push(evaluator.evaluate(rule, match, ruleOutput));
  }

  const passCount = results.filter((item) => item.passed).length;
  const failCount = results.length - passCount;
  const passRate = results.length === 0 ? 0 : passCount / results.length;

  return {
    ruleName: rule.name,
    sampleSize: sample.length,
    passCount,
    failCount,
    passRate,
    examples: results.slice(0, maxExamples),
  };
}

/**
 * 驗證單一 Rule 對歷史比賽樣本的一致性。
 */
export function validateRule(
  rule: Rule,
  historicalMatches: HistoricalMatchRecord[],
  options: RuleValidationOptions = {}
): RuleValidationSummary {
  const mode = options.mode ?? "dryRun";
  const sample = selectValidationSample(rule, historicalMatches);

  if (mode === "dryRun") {
    return buildDryRunSummary(rule, sample);
  }

  const evaluator =
    options.evaluator ?? NOT_IMPLEMENTED_RULE_OUTCOME_EVALUATOR;
  const maxExamples = options.maxExamples ?? DEFAULT_MAX_EXAMPLES;

  return buildEvaluateSummary(rule, sample, evaluator, maxExamples);
}

/**
 * 一次驗證 Registry 內的全部 Rule。
 */
export function runRuleValidation(
  historicalMatches: HistoricalMatchRecord[],
  options: RuleValidationOptions & { rules?: Rule[] } = {}
): RuleValidationReport {
  const rules = options.rules ?? getAllRegisteredRules();
  const mode = options.mode ?? "dryRun";

  return {
    validatedAt: new Date().toISOString(),
    mode,
    rules: rules.map((rule) =>
      validateRule(rule, historicalMatches, options)
    ),
  };
}
