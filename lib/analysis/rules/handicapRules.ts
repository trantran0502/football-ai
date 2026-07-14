import { NO_RULE_IMPLEMENTED } from "@/lib/analysis/constants";
import type { HandicapInterpretation } from "@/lib/analysis/types";

/** @deprecated 規則尚未實作 */
export type HandicapAnalysisResult = {
  status: "notImplemented";
  reason: string;
  interpretation: HandicapInterpretation;
};

/**
 * 獨立分析讓分盤 — 尚未實作。
 */
export function analyzeHandicap(
  interpretation: HandicapInterpretation
): HandicapAnalysisResult {
  return {
    status: "notImplemented",
    reason: NO_RULE_IMPLEMENTED,
    interpretation,
  };
}
