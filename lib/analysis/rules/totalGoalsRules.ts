import { NO_RULE_IMPLEMENTED } from "@/lib/analysis/constants";
import type { TotalGoalsInterpretation } from "@/lib/analysis/types";

/** @deprecated 規則尚未實作 */
export type TotalGoalsAnalysisResult = {
  status: "notImplemented";
  reason: string;
  interpretation: TotalGoalsInterpretation;
};

/**
 * 獨立分析大小球 — 尚未實作。
 */
export function analyzeTotalGoals(
  interpretation: TotalGoalsInterpretation
): TotalGoalsAnalysisResult {
  return {
    status: "notImplemented",
    reason: NO_RULE_IMPLEMENTED,
    interpretation,
  };
}
