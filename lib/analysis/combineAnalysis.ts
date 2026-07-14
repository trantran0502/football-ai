import { NO_RULE_IMPLEMENTED } from "@/lib/analysis/constants";
import type { CombinedAnalysis } from "@/lib/analysis/types";

/**
 * 合併各市場分析。
 * 規則未完成前，不輸出任何合併敘事。
 */
export function combineAnalysis(): CombinedAnalysis {
  return {
    status: "notImplemented",
    reason: NO_RULE_IMPLEMENTED,
  };
}
