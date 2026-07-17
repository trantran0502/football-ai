import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import { clampScore } from "@/lib/analysis/featureScore/oddsConversion";
import type { FeatureProviderKey } from "@/lib/providers/registry/types";
import type { ProviderResolutionAudit } from "@/lib/providers/teamProfile/teamProfileProviderPipeline";
import {
  applyProviderWeightingToFusion,
  computeProviderWeighting,
  type ProviderWeightingResult,
} from "@/lib/recommendation/providerWeightEngine";
import {
  buildFusionWarnings,
  computeExpectedValue,
  directionalMultiplier,
  evaluateGlobalPass,
  scoreBtts,
  scoreHandicap,
  scoreMoneyline,
  scoreToLevel,
  scoreTotalGoals,
} from "@/lib/recommendation/recommendationRules";
import type {
  RecommendationCandidate,
  RecommendationEngineInput,
  RecommendationEngineOptions,
  RecommendationEngineResult,
} from "@/lib/recommendation/recommendationTypes";
import {
  applyMarketEngineToCandidate,
  buildMarketAnalysisIndex,
  runMarketEngineForRecommendations,
} from "@/lib/recommendation/marketEngineIntegration";
import type { MarketSelection } from "@/types/match";

const SUPPORTED_MARKET_TYPES = new Set([
  "moneyline",
  "handicap",
  "totalGoals",
  "btts",
]);

export class RecommendationEngine {
  private readonly options: Required<RecommendationEngineOptions>;

  constructor(options: RecommendationEngineOptions = {}) {
    this.options = {
      minOverallConfidence: options.minOverallConfidence ?? 0.45,
      maxWarningsBeforePass: options.maxWarningsBeforePass ?? 3,
      maxConflictsBeforePass: options.maxConflictsBeforePass ?? 2,
      minTotalFeatures: options.minTotalFeatures ?? 5,
    };
  }

  recommend(input: RecommendationEngineInput): RecommendationEngineResult {
    return generateRecommendations(input.fusion, input.marketSelections, {
      ...this.options,
      evidenceReport: input.evidenceReport ?? null,
    });
  }
}

export function generateRecommendations(
  fusion: FeatureFusionResult,
  marketSelections: MarketSelection[],
  options: RecommendationEngineOptions & {
    providerAudit?: ProviderResolutionAudit | null;
    evidenceReport?: RecommendationEngineInput["evidenceReport"];
  } = {}
): RecommendationEngineResult {
  const weighting = options.providerAudit
    ? computeProviderWeighting(fusion, options.providerAudit)
    : null;
  const effectiveFusion = weighting
    ? applyProviderWeightingToFusion(fusion, weighting)
    : fusion;

  const passGate = evaluateGlobalPass(effectiveFusion, marketSelections);
  const fusionWarnings = buildFusionWarnings(effectiveFusion);
  const marketEngineSnapshot = runMarketEngineForRecommendations(marketSelections);
  const marketAnalysisByType = buildMarketAnalysisIndex(marketEngineSnapshot);

  const candidates = marketSelections
    .filter((selection) => isSupportedSelection(selection))
    .map((selection) =>
      buildCandidate(
        selection,
        effectiveFusion,
        weighting,
        passGate.pass,
        fusionWarnings,
        passGate.reason,
        marketAnalysisByType
      )
    );

  return {
    candidates,
    globalPass: passGate.pass,
    passReason: passGate.reason,
    usableProviderCount: weighting?.usableProviderCount ?? 0,
    unavailableProviderCount: weighting?.unavailableProviderCount ?? 0,
    providerDiagnostics: weighting?.diagnostics ?? [],
    providerOverallConfidence: weighting?.overallConfidence ?? null,
    evidenceReport: options.evidenceReport ?? null,
  };
}

function isSupportedSelection(selection: MarketSelection): boolean {
  if (selection.period !== "full") {
    return false;
  }
  if (!SUPPORTED_MARKET_TYPES.has(selection.marketType)) {
    return false;
  }
  if (selection.marketType === "handicap" && selection.marketFamily !== "asianHandicap") {
    return false;
  }
  if (selection.marketType === "totalGoals" && selection.marketFamily !== "asianOverUnder") {
    return false;
  }
  return true;
}

function buildCandidate(
  selection: MarketSelection,
  fusion: FeatureFusionResult,
  weighting: ProviderWeightingResult | null,
  globalPass: boolean,
  fusionWarnings: string[],
  passReason: string | null,
  marketAnalysisByType: ReturnType<typeof buildMarketAnalysisIndex>
): RecommendationCandidate {
  const direction = directionalMultiplier(selection.side, selection.marketType);
  const scored = scoreSelection(selection, fusion, direction, weighting?.normalizedWeights ?? null);
  const marketAdjusted = applyMarketEngineToCandidate({
    selection,
    featureScore: scored.score,
    marketAnalysisByType,
    globalPass,
  });
  const level = scoreToLevel(marketAdjusted.blendedScore, fusion.overallConfidence, globalPass);
  const expectedValue =
    globalPass || level === "pass"
      ? 0
      : computeExpectedValue(selection, marketAdjusted.blendedScore);

  const warnings = [...fusionWarnings, ...marketAdjusted.warnings];
  if (globalPass && passReason) {
    warnings.unshift(passReason);
  }
  if (level === "pass" && !globalPass) {
    warnings.push("Signal strength is too weak for a actionable recommendation.");
  }
  if (fusion.warnings.some((warning) => warning.code === "feature_conflict")) {
    warnings.push("Conflicting feature signals may reduce recommendation quality.");
  }
  if (fusion.warnings.some((warning) => warning.code === "small_sample_size")) {
    warnings.push("Some supporting features rely on a small sample size.");
  }

  return {
    marketType: selection.marketType,
    selection,
    confidence: level,
    expectedValue,
    score: globalPass ? 0 : clampScore(marketAdjusted.blendedScore),
    reasons: globalPass ? [] : [...scored.reasons, ...marketAdjusted.reasons],
    warnings: uniqueStrings(warnings),
    supportingFeatures: globalPass ? [] : scored.supportingFeatures,
  };
}

function scoreSelection(
  selection: MarketSelection,
  fusion: FeatureFusionResult,
  direction: number,
  normalizedWeights: Partial<Record<FeatureProviderKey, number>> | null
): { score: number; supportingFeatures: string[]; reasons: string[] } {
  if (direction === 0) {
    return scoreDraw(fusion);
  }

  switch (selection.marketType) {
    case "moneyline":
      return scoreMoneyline(fusion, direction, normalizedWeights);
    case "handicap":
      return scoreHandicap(fusion, direction, normalizedWeights);
    case "totalGoals":
      return scoreTotalGoals(fusion, direction, normalizedWeights);
    case "btts":
      return scoreBtts(fusion, direction, normalizedWeights);
    default:
      return { score: 0, supportingFeatures: [], reasons: [] };
  }
}

function scoreDraw(
  fusion: FeatureFusionResult
): { score: number; supportingFeatures: string[]; reasons: string[] } {
  const balance = 100 - Math.abs(fusion.overallScore);
  const h2hDraw = Math.abs(findDrawFactorScore(fusion));
  const score = clampScore(Math.min(balance, h2hDraw) * 0.4);

  return {
    score,
    supportingFeatures: findDrawFactorScore(fusion) > 0 ? ["Draw Rate"] : [],
    reasons:
      score >= 15
        ? ["Balanced fusion signals leave room for a draw outcome."]
        : [],
  };
}

function findDrawFactorScore(fusion: FeatureFusionResult): number {
  const drawFactor = fusion.strongestFactors.find((factor) => factor.id === "h2h.draw_rate");
  if (drawFactor) {
    return drawFactor.score;
  }
  return fusion.weakestFactors.find((factor) => factor.id === "h2h.draw_rate")?.score ?? 0;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
