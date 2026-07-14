import {
  generateBetaRecommendation,
  generateCandidates,
} from "@/lib/analysis/candidateGenerator";
import { isBetaRecommendationModeEnabled } from "@/lib/beta/config";
import { interpretMarkets } from "@/lib/analysis/marketInterpreter";
import { buildAnalysisFeatures } from "@/lib/analysis/featureBuilder";
import { validateCrossMarkets } from "@/lib/analysis/crossMarketValidator";
import type { AnalysisReport } from "@/lib/analysis/types";
import { parseOdds } from "@/lib/parser/parser";
import { normalizeMarketSelections } from "@/lib/parser/normalizeMarketSelections";

/**
 * 端到端分析流程：
 * 貼上盤口 → Parser → normalize → Analysis Engine → Candidate Generator → AnalysisReport
 */
export function analyzeMatch(rawText: string): AnalysisReport {
  const match = parseOdds(rawText);
  const markets = normalizeMarketSelections(match.marketSelections);

  const features = buildAnalysisFeatures(markets);
  const interpretations = interpretMarkets(features);
  const validation = validateCrossMarkets(markets);
  const betaRecommendation = generateBetaRecommendation(validation, markets);
  const candidates = generateCandidates(
    features,
    interpretations,
    validation,
    markets
  );

  return {
    match: {
      ...match,
      marketSelections: markets,
    },
    markets,
    interpretations,
    crossMarketValidation: validation,
    candidates,
    betaRecommendation: {
      enabled: isBetaRecommendationModeEnabled(),
      candidates: betaRecommendation.candidates,
      message: betaRecommendation.message,
    },
  };
}

export type { AnalysisReport } from "@/lib/analysis/types";
