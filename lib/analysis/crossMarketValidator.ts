import {
  buildSkippedReason,
  countAvailableMarkets,
  resolveCoverageLabel,
  summarizeCrossMarketRules,
} from "@/lib/analysis/marketCoverage";
import { moneylineHandicapRule } from "@/lib/analysis/rules/moneylineHandicapRule";
import { totalGoalsHandicapRule } from "@/lib/analysis/rules/totalGoalsHandicapRule";
import type {
  CrossMarketRuleResult,
  CrossMarketRuleStatus,
  CrossMarketValidation,
  MarketSelectionInput,
} from "@/lib/analysis/types";
import {
  pickPrimaryBtts,
  pickPrimaryHandicap,
  pickPrimaryMoneyline,
  pickPrimaryTotalGoals,
} from "@/lib/rules/marketPickers";

function toCrossMarketResult(
  status: CrossMarketRuleStatus,
  reason: string
): CrossMarketRuleResult {
  return { status, reason };
}

function mapRuleOutput(raw: {
  consistent: boolean;
  reason: string;
}): CrossMarketRuleResult {
  if (!raw.consistent) {
    return toCrossMarketResult("FAIL", raw.reason);
  }
  return toCrossMarketResult("PASS", raw.reason);
}

function buildTotalGoalsBttsRule(
  totalGoalsCount: number,
  bttsCount: number
): CrossMarketRuleResult {
  const missing: string[] = [];
  if (totalGoalsCount === 0) {
    missing.push("Total Goals");
  }
  if (bttsCount === 0) {
    missing.push("BTTS");
  }

  if (missing.length > 0) {
    return toCrossMarketResult(
      "SKIPPED",
      buildSkippedReason("Rule 3（Total Goals × BTTS）", missing)
    );
  }

  return toCrossMarketResult(
    "SKIPPED",
    "Total Goals × BTTS 交叉規則尚未實作，僅標記為跳過。"
  );
}

/**
 * 交叉市場驗證。
 * Rule #1：Moneyline × Handicap
 * Rule #2：Handicap × Total Goals
 * Rule #3：Total Goals × BTTS（尚未實作，缺少市場時標記 SKIPPED）
 */
export function validateCrossMarkets(
  marketSelections: MarketSelectionInput
): CrossMarketValidation {
  const moneyline = pickPrimaryMoneyline(marketSelections);
  const handicap = pickPrimaryHandicap(marketSelections);
  const totalGoals = pickPrimaryTotalGoals(marketSelections);
  const btts = pickPrimaryBtts(marketSelections);

  const rule1Missing: string[] = [];
  if (moneyline.length === 0) {
    rule1Missing.push("Moneyline");
  }
  if (handicap.length === 0) {
    rule1Missing.push("Handicap");
  }

  const rule2Missing: string[] = [];
  if (handicap.length === 0) {
    rule2Missing.push("Handicap");
  }
  if (totalGoals.length === 0) {
    rule2Missing.push("Total Goals");
  }

  const moneylineHandicap =
    rule1Missing.length > 0
      ? toCrossMarketResult(
          "SKIPPED",
          buildSkippedReason("Rule 1（Moneyline × Handicap）", rule1Missing)
        )
      : mapRuleOutput(moneylineHandicapRule({ moneyline, handicap }));

  const handicapTotalGoals =
    rule2Missing.length > 0
      ? toCrossMarketResult(
          "SKIPPED",
          buildSkippedReason("Rule 2（Handicap × Total Goals）", rule2Missing)
        )
      : mapRuleOutput(totalGoalsHandicapRule({ handicap, totalGoals }));

  const totalGoalsBtts = buildTotalGoalsBttsRule(totalGoals.length, btts.length);

  const ruleSummary = summarizeCrossMarketRules([
    {
      result: moneylineHandicap,
      implemented: true,
      runnable: rule1Missing.length === 0,
    },
    {
      result: handicapTotalGoals,
      implemented: true,
      runnable: rule2Missing.length === 0,
    },
    {
      result: totalGoalsBtts,
      implemented: false,
      runnable: totalGoals.length > 0 && btts.length > 0,
    },
  ]);

  return {
    ...ruleSummary,
    availableMarkets: countAvailableMarkets(marketSelections),
    coverageLabel: resolveCoverageLabel(ruleSummary.status),
    moneylineHandicap,
    handicapTotalGoals,
    totalGoalsBtts,
  };
}
