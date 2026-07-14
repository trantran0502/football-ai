import type {
  AnalysisCandidate,
  AnalysisFeature,
  CrossMarketValidation,
  MarketInterpretation,
} from "@/lib/analysis/types";
import {
  betaCandidateToAnalysisCandidate,
  generateBetaCandidates,
} from "@/lib/beta/betaCandidateGenerator";
import {
  BETA_EMPTY_MESSAGE,
  isBetaRecommendationModeEnabled,
} from "@/lib/beta/config";
import type { BetaGenerationResult } from "@/lib/beta/types";
import type { MarketSelection } from "@/types/match";

/**
 * 候選產生器。
 * Beta 模式關閉時不產生候選；開啟時依證據門檻產生 Beta Candidate。
 */
export function generateCandidates(
  _features: AnalysisFeature[],
  _interpretations: MarketInterpretation[],
  validation: CrossMarketValidation,
  markets: MarketSelection[] = []
): AnalysisCandidate[] {
  const beta = generateBetaRecommendation(validation, markets);
  return beta.candidates.map((candidate) =>
    betaCandidateToAnalysisCandidate(candidate, markets)
  );
}

export function generateBetaRecommendation(
  validation: CrossMarketValidation,
  markets: MarketSelection[] = []
): BetaGenerationResult {
  if (!isBetaRecommendationModeEnabled()) {
    return { candidates: [], message: BETA_EMPTY_MESSAGE };
  }

  return generateBetaCandidates(markets, validation);
}
