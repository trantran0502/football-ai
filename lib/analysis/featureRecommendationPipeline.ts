import { registerAllFeatureCollectors } from "@/lib/analysis/featureScore/registerAllFeatureCollectors";
import { buildFeatureScores } from "@/lib/analysis/featureScore/featureScoreEngine";
import { fuseFeatureScores } from "@/lib/analysis/featureScore/fusion/featureFusionEngine";
import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import type { RecommendationSection } from "@/lib/analysis/types";
import { generateRecommendations } from "@/lib/recommendation/recommendationEngine";
import type { RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";
import { runDecisionV3ShadowIfEnabled } from "@/lib/decision/v3/decisionShadowMode";
import { isDecisionV3ShadowEnabled } from "@/lib/decision/v3/decisionConfig";
import { collectEvidence } from "@/lib/evidence/evidenceEngine";
import { isEvidenceV3ShadowEnabled } from "@/lib/evidence/v3/evidenceConfig";
import { runEvidenceV3ShadowIfEnabled } from "@/lib/evidence/v3/evidenceShadowMode";
import { isRecommendationDualWriteEnabled } from "@/lib/recommendation/v3/recommendationDualWriteConfig";
import { runRecommendationDualWriteIfEnabled } from "@/lib/recommendation/v3/recommendationDualWrite";
import { createShadowRunId, resetShadowRunsForTests } from "@/lib/shadow/shadowRunScope";
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
import {
  prepareProductionH2HContext,
  resetProductionH2HContext,
  type ProductionH2HContext,
} from "@/lib/providers/h2h/productionH2HProvider";
import { clearProductionH2HCacheForTests } from "@/lib/providers/h2h/h2hCache";
import {
  prepareProductionLeagueStrengthContext,
  resetProductionLeagueStrengthContext,
  type ProductionLeagueStrengthContext,
} from "@/lib/providers/leagueStrength/productionLeagueStrengthProvider";
import { clearProductionLeagueStrengthCacheForTests } from "@/lib/providers/leagueStrength/leagueStrengthCache";
import {
  prepareProductionSquadAvailabilityContext,
  resetProductionSquadAvailabilityContext,
  type ProductionSquadAvailabilityContext,
} from "@/lib/providers/squadAvailability/productionSquadAvailabilityProvider";
import { clearProductionSquadAvailabilityCacheForTests } from "@/lib/providers/squadAvailability/squadAvailabilityCache";
import {
  prepareProductionMatchContextContext,
  resetProductionMatchContextContext,
  type ProductionMatchContextContext,
} from "@/lib/providers/matchContext/productionMatchContextProvider";
import { clearProductionMatchContextCacheForTests } from "@/lib/providers/matchContext/matchContextCache";
import { resetFeatureProviderRegistryForTests } from "@/lib/providers/registry";
import type { LoadedRuntimeWeightConfig } from "@/lib/recommendation/weightConfigTypes";
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
  evidenceReport: import("@/lib/evidence/evidenceTypes").EvidenceReport | null;
  shadowRunId?: string;
}

export interface FeatureRecommendationPipelineOptions {
  teamProfiles?: MatchTeamProfilesSnapshot | null;
  matchDate?: string;
  h2hContext?: ProductionH2HContext | null;
  leagueStrengthContext?: ProductionLeagueStrengthContext | null;
  squadAvailabilityContext?: ProductionSquadAvailabilityContext | null;
  matchContextContext?: ProductionMatchContextContext | null;
  runtimeWeightConfig?: LoadedRuntimeWeightConfig | null;
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
      evidenceReport: null,
    };
  }

  prepareTeamProfileProviderContext(options.teamProfiles ?? null);
  prepareProductionH2HContext(options.h2hContext ?? null);
  prepareProductionLeagueStrengthContext(options.leagueStrengthContext ?? null);
  prepareProductionSquadAvailabilityContext(options.squadAvailabilityContext ?? null);
  prepareProductionMatchContextContext(options.matchContextContext ?? null);

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
        evidenceReport: null,
      };
    }

    const fusion = fuseFeatureScores(annotatedFeatures);
    const evidenceReport = collectEvidence({
      fusion,
      features: annotatedFeatures,
      marketSelections: markets,
      providerAudit,
      teamProfiles: options.teamProfiles ?? null,
    });
    const recommendation = generateRecommendations(fusion, markets, {
      providerAudit,
      evidenceReport,
      runtimeWeightConfig: options.runtimeWeightConfig ?? null,
    });
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

    const shadowRunId = runShadowV3IfEnabled({
      match,
      markets,
      options,
      providerAudit,
      legacyRecommendation: guarded.recommendation,
    });

    return {
      fusion: guarded.fusion,
      recommendation: guarded.recommendation,
      section,
      providerAudit,
      evidenceReport,
      shadowRunId,
    };
  } finally {
    resetTeamProfileProviderContext();
    resetProductionH2HContext();
    resetProductionLeagueStrengthContext();
    resetProductionSquadAvailabilityContext();
    resetProductionMatchContextContext();
  }
}

export function resetFeatureRecommendationPipelineForTests(): void {
  collectorsBootstrapped = false;
  resetTeamProfileProviderContext();
  resetProductionH2HContext();
  resetProductionLeagueStrengthContext();
  resetProductionSquadAvailabilityContext();
  resetProductionMatchContextContext();
  clearProductionH2HCacheForTests();
  clearProductionLeagueStrengthCacheForTests();
  clearProductionSquadAvailabilityCacheForTests();
  clearProductionMatchContextCacheForTests();
  resetFeatureProviderRegistryForTests();
  resetShadowRunsForTests();
}

function runShadowV3IfEnabled(input: {
  match: MatchData;
  markets: MarketSelection[];
  options: FeatureRecommendationPipelineOptions;
  providerAudit: ProviderResolutionAudit;
  legacyRecommendation: RecommendationEngineResult | null;
}): string | undefined {
  if (
    !isEvidenceV3ShadowEnabled() &&
    !isDecisionV3ShadowEnabled() &&
    !isRecommendationDualWriteEnabled()
  ) {
    return undefined;
  }

  const collectorContext = {
    homeTeam: input.match.homeTeam,
    awayTeam: input.match.awayTeam,
    league: input.match.league,
    matchDate: input.options.matchDate,
    marketSelections: input.markets,
    providerAudit: input.providerAudit,
    teamProfiles: input.options.teamProfiles ?? null,
  };

  const shadowRunId = createShadowRunId({
    homeTeam: input.match.homeTeam,
    awayTeam: input.match.awayTeam,
  });

  const evidenceCollection = runEvidenceV3ShadowIfEnabled(
    shadowRunId,
    collectorContext
  );

  runDecisionV3ShadowIfEnabled({
    runId: shadowRunId,
    evidenceCollection,
    collectorContext,
    marketSelections: input.markets,
    runtimeWeightConfig: input.options.runtimeWeightConfig ?? null,
  });

  runRecommendationDualWriteIfEnabled({
    runId: shadowRunId,
    legacyRecommendation: input.legacyRecommendation,
    evidenceCollection,
    collectorContext,
    marketSelections: input.markets,
    runtimeWeightConfig: input.options.runtimeWeightConfig ?? null,
  });

  return shadowRunId;
}
