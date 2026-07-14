import { analyzeMarkets } from "@/lib/analysis/analyzeMarkets";
import { combineAnalysis } from "@/lib/analysis/combineAnalysis";
import { generateCandidates } from "@/lib/analysis/candidateGenerator";
import { validateCrossMarkets } from "@/lib/analysis/crossMarketValidator";
import { buildAnalysisFeatures } from "@/lib/analysis/featureBuilder";
import { interpretMarkets } from "@/lib/analysis/marketInterpreter";
import type {
  AnalysisEngineResult,
  MarketSelectionInput,
} from "@/lib/analysis/types";

/**
 * Analysis Engine v2
 *
 * marketSelections
 *   → features
 *   → interpretations
 *   → marketAnalysis（各市場獨立 Rule）
 *   → combinedAnalysis
 *   → crossMarket（Rule Registry 管理的 cross-market rules）
 *   → candidates
 *
 * Cross-market rules 目前仍由 crossMarketValidator 執行。
 * 未來須改為透過 lib/rules（Registry + Enablement）僅啟用已通過 Validation 的 Rule。
 *
 * 不含 Score、Recommendation、AI 或歷史資料。
 */
export function runAnalysisEngine(
  marketSelections: MarketSelectionInput
): AnalysisEngineResult {
  const features = buildAnalysisFeatures(marketSelections);
  const interpretations = interpretMarkets(features);
  const marketAnalysis = analyzeMarkets();
  const combinedAnalysis = combineAnalysis();
  const validation = validateCrossMarkets(marketSelections);
  const candidates = generateCandidates(
    features,
    interpretations,
    validation,
    marketSelections
  );

  return {
    features,
    interpretations,
    marketAnalysis,
    combinedAnalysis,
    candidates,
  };
}

export { buildAnalysisFeatures } from "@/lib/analysis/featureBuilder";
export { interpretMarkets } from "@/lib/analysis/marketInterpreter";
export { analyzeMarkets } from "@/lib/analysis/analyzeMarkets";
export { combineAnalysis } from "@/lib/analysis/combineAnalysis";
export { validateCrossMarkets } from "@/lib/analysis/crossMarketValidator";
export { generateCandidates } from "@/lib/analysis/candidateGenerator";
export { analyzeMatch } from "@/lib/analysis/analyzeMatch";
export type {
  AnalysisCandidate,
  AnalysisEngineResult,
  AnalysisFeature,
  AnalysisReport,
  CombinedAnalysis,
  CrossMarketValidation,
  MarketAnalysis,
  MarketInterpretation,
} from "@/lib/analysis/types";
export type { AnalysisField } from "@/lib/analysis/analysisField";
