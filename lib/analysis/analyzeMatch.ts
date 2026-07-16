import {
  generateBetaRecommendation,
  generateCandidates,
} from "@/lib/analysis/candidateGenerator";
import { runFeatureRecommendationPipeline } from "@/lib/analysis/featureRecommendationPipeline";
import { buildBettingIntelligence } from "@/lib/betting/intelligenceEngine";
import { buildDecision } from "@/lib/decision/decisionEngine";
import { isBetaRecommendationModeEnabled } from "@/lib/beta/config";
import { interpretMarkets } from "@/lib/analysis/marketInterpreter";
import { buildAnalysisFeatures } from "@/lib/analysis/featureBuilder";
import { validateCrossMarkets } from "@/lib/analysis/crossMarketValidator";
import type { MatchTeamProfilesSnapshot } from "@/lib/teamProfile/teamProfileTypes";
import type { ProductionH2HContext } from "@/lib/providers/h2h/productionH2HProvider";
import type { ProductionLeagueStrengthContext } from "@/lib/providers/leagueStrength/productionLeagueStrengthProvider";
import type { AnalysisReport } from "@/lib/analysis/types";
import { parseOdds } from "@/lib/parser/parser";
import { normalizeMarketSelections } from "@/lib/parser/normalizeMarketSelections";

/**
 * 端到端分析流程：
 * 貼上盤口 → Parser → normalize → Analysis Engine → Feature Fusion → Recommendation → AnalysisReport
 */
export function analyzeMatch(
  rawText: string,
  options: {
    teamProfiles?: MatchTeamProfilesSnapshot | null;
    matchDate?: string;
    h2hContext?: ProductionH2HContext | null;
    leagueStrengthContext?: ProductionLeagueStrengthContext | null;
  } = {}
): AnalysisReport {
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
  const { section: recommendation } = runFeatureRecommendationPipeline(
    {
      ...match,
      marketSelections: markets,
    },
    markets,
    {
      teamProfiles: options.teamProfiles ?? null,
      matchDate: options.matchDate,
      h2hContext: options.h2hContext ?? null,
      leagueStrengthContext: options.leagueStrengthContext ?? null,
    }
  );
  const bettingIntelligence = buildBettingIntelligence({
    marketSelections: markets,
    oddsHistory: { timelines: [] },
    fusion: recommendation.fusion,
  });
  const decision = buildDecision({
    fusion: recommendation.fusion,
    bettingIntelligence,
    recommendationCandidates: recommendation.result?.candidates ?? [],
    recommendationResult: recommendation.result,
  });

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
    recommendation,
    bettingIntelligence,
    decision,
    teamProfiles: options.teamProfiles ?? null,
  };
}

export type { AnalysisReport } from "@/lib/analysis/types";
