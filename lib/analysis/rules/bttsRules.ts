import { NO_RULE_IMPLEMENTED } from "@/lib/analysis/constants";
import type { BttsInterpretation } from "@/lib/analysis/types";

/** @deprecated 規則尚未實作 */
export type BttsAnalysisResult = {
  status: "notImplemented";
  reason: string;
  interpretation: BttsInterpretation;
};

/**
 * 獨立分析 BTTS — 尚未實作。
 */
export function analyzeBtts(
  interpretation: BttsInterpretation
): BttsAnalysisResult {
  return {
    status: "notImplemented",
    reason: NO_RULE_IMPLEMENTED,
    interpretation,
  };
}
