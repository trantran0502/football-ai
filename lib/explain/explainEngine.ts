import { buildExplainInputs } from "@/lib/explain/reasonBuilder";
import { buildSummary } from "@/lib/explain/summaryBuilder";
import type { ExplainReport } from "@/lib/explain/types";
import type { AnalysisReport } from "@/lib/analysis/types";

/**
 * Explain Engine：將 AnalysisReport 轉為可審計的結構化解釋。
 * 不產生自然語言長文，只輸出 ExplainReport JSON。
 */
export function explainAnalysis(report: AnalysisReport): ExplainReport {
  const { marketReasons, ruleReasons, conflicts, confidenceReason } =
    buildExplainInputs(report);

  return {
    summary: buildSummary({ marketReasons, ruleReasons, conflicts }),
    marketReasons,
    ruleReasons,
    conflicts,
    confidenceReason,
  };
}
