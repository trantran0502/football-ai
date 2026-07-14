import { NO_RULE_IMPLEMENTED } from "@/lib/analysis/constants";
import type { MarketAnalysis } from "@/lib/analysis/types";

/**
 * 各市場獨立分析。
 * 規則未完成前，不輸出任何市場分析結果。
 */
export function analyzeMarkets(): MarketAnalysis {
  return {
    status: "notImplemented",
    reason: NO_RULE_IMPLEMENTED,
  };
}
