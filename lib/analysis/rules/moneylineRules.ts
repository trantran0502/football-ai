import { NO_RULE_IMPLEMENTED } from "@/lib/analysis/constants";
import type { MoneylineInterpretation } from "@/lib/analysis/types";

/** @deprecated 規則尚未實作 */
export type MoneylineAnalysisResult = {
  status: "notImplemented";
  reason: string;
  interpretation: MoneylineInterpretation;
};

/**
 * 獨立分析 Moneyline — 尚未實作。
 */
export function analyzeMoneyline(
  interpretation: MoneylineInterpretation
): MoneylineAnalysisResult {
  return {
    status: "notImplemented",
    reason: NO_RULE_IMPLEMENTED,
    interpretation,
  };
}
