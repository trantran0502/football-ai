import { getRegisteredRule } from "@/lib/rules/ruleRegistry";
import type { RuleValidationSummary } from "@/lib/rules/validation/types";
import type { RegisteredRule, RuleName } from "@/lib/rules/types";

export type RuleValidationStatus = "pending" | "passed" | "failed";

export interface RuleEnablementRecord {
  ruleName: RuleName;
  status: RuleValidationStatus;
  lastValidatedAt: string | null;
  validationSummary: RuleValidationSummary | null;
}

/**
 * 記憶體內的 Rule 啟用狀態。
 * 未來由 Rule Validation Engine 更新；目前全部為 pending，Analysis Engine 不應直接信任 Rule。
 */
const enablementState = new Map<RuleName, RuleEnablementRecord>(
  (["MoneylineHandicapRule", "HandicapTotalGoalsRule"] as const).map(
    (ruleName) => [
      ruleName,
      {
        ruleName,
        status: "pending",
        lastValidatedAt: null,
        validationSummary: null,
      },
    ]
  )
);

export function getRuleEnablement(ruleName: RuleName): RuleEnablementRecord {
  const record = enablementState.get(ruleName);
  if (!record) {
    throw new Error(`Unknown rule: ${ruleName}`);
  }
  return { ...record };
}

export function getAllRuleEnablements(): RuleEnablementRecord[] {
  return [...enablementState.values()].map((record) => ({ ...record }));
}

/** Rule 是否已通過 Validation 並可正式啟用。 */
export function isRuleEnabled(ruleName: RuleName): boolean {
  return enablementState.get(ruleName)?.status === "passed";
}

/** 取得已通過 Validation 的 Rule；未通過則回傳 null。 */
export function requireValidatedRule(ruleName: RuleName): RegisteredRule | null {
  if (!isRuleEnabled(ruleName)) {
    return null;
  }
  return getRegisteredRule(ruleName) ?? null;
}

export function getEnabledRules(): RegisteredRule[] {
  return (["MoneylineHandicapRule", "HandicapTotalGoalsRule"] as const)
    .filter((name) => isRuleEnabled(name))
    .map((name) => getRegisteredRule(name))
    .filter((rule): rule is RegisteredRule => rule !== undefined);
}

/**
 * 由 Validation Engine 更新啟用狀態。
 * 門檻與通過條件留待未來實作 evaluator 後決定。
 */
export function applyRuleValidationSummary(
  summary: RuleValidationSummary,
  options?: { passRateThreshold?: number }
): RuleEnablementRecord {
  const threshold = options?.passRateThreshold ?? 0;
  const status: RuleValidationStatus =
    summary.sampleSize === 0
      ? "pending"
      : summary.passRate >= threshold
        ? "passed"
        : "failed";

  const record: RuleEnablementRecord = {
    ruleName: summary.ruleName,
    status,
    lastValidatedAt: new Date().toISOString(),
    validationSummary: summary,
  };

  enablementState.set(summary.ruleName, record);
  return { ...record };
}

/** 測試或重設用：將所有 Rule 恢復為 pending。 */
export function resetRuleEnablement(): void {
  for (const ruleName of enablementState.keys()) {
    enablementState.set(ruleName, {
      ruleName,
      status: "pending",
      lastValidatedAt: null,
      validationSummary: null,
    });
  }
}
