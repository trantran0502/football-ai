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
import { applyRecommendationProviderGuard } from "@/lib/recommendation/recommendationProviderGuard";
import {
  annotateFeatureProviderSources,
  auditProviderResolution,
  prepareTeamProfileProviderContext,
  resetTeamProfileProviderContext,
  resolveAllProviderSnapshots,
  type ProviderResolutionAudit,
} from "@/lib/providers/teamProfile/teamProfileProviderPipeline";
import { resetFeatureProviderRegistryForTests } from "@/lib/providers/registry";
import type { MatchTeamProfilesSnapshot } from "@/lib/teamProfile/teamProfileTypes";
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
  providerAudit: ProviderResolutionAudit | null;
}

export interface FeatureRecommendationPipelineOptions {
  teamProfiles?: MatchTeamProfilesSnapshot | null;
  matchDate?: string;
}

export function runFeatureRecommendationPipeline(
  match: MatchData,
  markets: MarketSelection[],
  options: FeatureRecommendationPipelineOptions = {}
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
      providerAudit: null,
    };
  }

  prepareTeamProfileProviderContext(options.teamProfiles ?? null);

  try {
    const providerSnapshots = resolveAllProviderSnapshots({
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      matchDate: options.matchDate,
      league: match.league,
    });
    const providerAudit = auditProviderResolution(providerSnapshots);

    const featureResult = buildFeatureScores({
      marketSelections: markets,
      metadata: {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        league: match.league,
        providerAudit,
      },
    });

    const annotatedFeatures = annotateFeatureProviderSources(
      featureResult.features,
      providerAudit
    );

    if (annotatedFeatures.length === 0) {
      return {
        fusion: null,
        recommendation: null,
        section: {
          enabled: true,
          fusion: null,
          result: null,
          message: EMPTY_RECOMMENDATION_MESSAGE,
        },
        providerAudit,
      };
    }

    const fusion = fuseFeatureScores(annotatedFeatures);
    const recommendation = generateRecommendations(fusion, markets);
    const guarded = applyRecommendationProviderGuard({
      fusion,
      recommendation,
      audit: providerAudit,
    });

    const section: RecommendationSection = {
      enabled: true,
      fusion: guarded.fusion,
      result: guarded.recommendation,
      message: guarded.forcedPass
        ? guarded.passReason ?? EMPTY_RECOMMENDATION_MESSAGE
        : getRecommendationMessage(guarded.recommendation),
    };

    return {
      fusion: guarded.fusion,
      recommendation: guarded.recommendation,
      section,
      providerAudit,
    };
  } finally {
    resetTeamProfileProviderContext();
  }
}

export function resetFeatureRecommendationPipelineForTests(): void {
  collectorsBootstrapped = false;
  resetTeamProfileProviderContext();
  resetFeatureProviderRegistryForTests();
}
