import type { CrossMarketRuleResult, CrossMarketValidation } from "@/lib/analysis/types";
import type { MarketSelection } from "@/types/match";

const PRIMARY_MARKET_TYPES: MarketSelection["marketType"][] = [
  "moneyline",
  "handicap",
  "totalGoals",
  "btts",
  "teamGoals",
];

export function countAvailableMarkets(
  marketSelections: readonly MarketSelection[]
): number {
  const available = new Set<MarketSelection["marketType"]>();

  for (const selection of marketSelections) {
    if (selection.period !== "full") {
      continue;
    }
    if (PRIMARY_MARKET_TYPES.includes(selection.marketType)) {
      available.add(selection.marketType);
    }
  }

  return available.size;
}

export function resolveCoverageLabel(
  status: CrossMarketValidation["status"]
): string {
  switch (status) {
    case "COMPLETE":
      return "完整";
    case "PARTIAL":
      return "部分";
    case "INSUFFICIENT":
      return "不足";
  }
}

export interface CrossMarketRuleSlot {
  result: CrossMarketRuleResult;
  implemented: boolean;
  runnable: boolean;
}

export function summarizeCrossMarketRules(
  slots: CrossMarketRuleSlot[]
): Pick<
  CrossMarketValidation,
  "executedRules" | "skippedRules" | "status"
> {
  const executedRules = slots.filter(
    (slot) => slot.result.status !== "SKIPPED"
  ).length;
  const skippedRules = slots.filter(
    (slot) => slot.result.status === "SKIPPED"
  ).length;

  const runnableImplemented = slots.filter(
    (slot) => slot.implemented && slot.runnable
  );
  const runnableExecuted = runnableImplemented.filter(
    (slot) => slot.result.status !== "SKIPPED"
  );
  const missingMarketSlots = slots.filter(
    (slot) => slot.implemented && !slot.runnable
  );

  if (runnableExecuted.length === 0) {
    return { executedRules, skippedRules, status: "INSUFFICIENT" };
  }

  if (missingMarketSlots.length > 0) {
    return { executedRules, skippedRules, status: "PARTIAL" };
  }

  return { executedRules, skippedRules, status: "COMPLETE" };
}

export function buildSkippedReason(
  ruleLabel: string,
  missingMarkets: string[]
): string {
  return `缺少 ${missingMarkets.join("、")} 市場，無法執行 ${ruleLabel}。`;
}
