import { registerAllFeatureCollectors } from "@/lib/analysis/featureScore/registerAllFeatureCollectors";
import { buildFeatureScores } from "@/lib/analysis/featureScore/featureScoreEngine";
import { fuseFeatureScores } from "@/lib/analysis/featureScore/fusion/featureFusionEngine";
import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import type { RecommendationSection } from "@/lib/analysis/types";
import { generateRecommendations } from "@/lib/recommendation/recommendationEngine";
import type { RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";
import {
  EMPTY_RECOMMENDATION_MESSAGE,
  getRecommendationMessage,
} from "@/lib/recommendation/recommendationPresentation";
import type { MarketSelection, MatchData } from "@/types/match";

let collectorsBootstrapped = false;

function ensureFeatureCollectorsRegistered(): void {
  if (collectorsBootstrapped) {
    return;
  }
  registerAllFeatureCollectors();
  collectorsBootstrapped = true;
}

export interface FeatureRecommendationPipelineResult {
  fusion: FeatureFusionResult | null;
  recommendation: RecommendationEngineResult | null;
  section: RecommendationSection;
}

export function runFeatureRecommendationPipeline(
  match: MatchData,
  markets: MarketSelection[]
): FeatureRecommendationPipelineResult {
  ensureFeatureCollectorsRegistered();

  if (markets.length === 0) {
    return {
      fusion: null,
      recommendation: null,
      section: {
        enabled: true,
        fusion: null,
        result: null,
        message: EMPTY_RECOMMENDATION_MESSAGE,
      },
    };
  }

  const featureResult = buildFeatureScores({
    marketSelections: markets,
    metadata: {
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      league: match.league,
    },
  });

  if (featureResult.features.length === 0) {
    return {
      fusion: null,
      recommendation: null,
      section: {
        enabled: true,
        fusion: null,
        result: null,
        message: EMPTY_RECOMMENDATION_MESSAGE,
      },
    };
  }

  const fusion = fuseFeatureScores(featureResult.features);
  const recommendation = generateRecommendations(fusion, markets);

  const section: RecommendationSection = {
    enabled: true,
    fusion,
    result: recommendation,
    message: getRecommendationMessage(recommendation),
  };

  return { fusion, recommendation, section };
}

export function resetFeatureRecommendationPipelineForTests(): void {
  collectorsBootstrapped = false;
}
