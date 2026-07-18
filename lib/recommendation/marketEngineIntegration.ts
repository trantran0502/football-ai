import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import { clampScore } from "@/lib/analysis/featureScore/oddsConversion";
import type { MarketSelection } from "@/types/match";
import { runMarketEngine } from "@/lib/recommendation/marketEngine/marketEngine";
import type {
  MarketAnalysis,
  MarketAnalysisSnapshot,
  MarketEngineType,
} from "@/lib/recommendation/marketEngine/marketEngineTypes";
import { buildFallbackWeightConfig } from "@/lib/recommendation/weightConfigRuntime";

export const MARKET_ENGINE_INTEGRATION_REASON_PREFIX = "Market engine:";

export function blendFeatureAndMarketEngineScore(
  featureScore: number,
  marketSideScore: number,
  marketBlendWeight: number = buildFallbackWeightConfig().marketBlendWeight
): number {
  const featureBlendWeight = 1 - marketBlendWeight;
  return featureScore * featureBlendWeight + marketSideScore * marketBlendWeight;
}

export function resolveEngineMarketType(
  selection: MarketSelection
): MarketEngineType | null {
  switch (selection.marketType) {
    case "moneyline":
      return "1X2";
    case "handicap":
      return selection.marketFamily === "asianHandicap" ? "AH" : null;
    case "totalGoals":
      return selection.marketFamily === "asianOverUnder" ? "O/U" : null;
    case "btts":
      return "BTTS";
    default:
      return null;
  }
}

export function buildMarketAnalysisIndex(
  snapshot: MarketAnalysisSnapshot
): Map<MarketEngineType, MarketAnalysis> {
  return new Map(snapshot.markets.map((market) => [market.marketType, market]));
}

export function runMarketEngineForRecommendations(
  marketSelections: MarketSelection[]
): MarketAnalysisSnapshot {
  return runMarketEngine(marketSelections);
}

function normalizeMarketSideScore(finalScore: number): number {
  return (finalScore - 50) * 2;
}

export function computeMarketEngineSideScore(
  analysis: MarketAnalysis,
  selection: MarketSelection
): number {
  const centered = normalizeMarketSideScore(analysis.finalScore);
  const { recommendation } = analysis;

  if (recommendation.action === "avoid") {
    return -Math.max(25, Math.abs(centered));
  }

  if (recommendation.action === "pass") {
    return centered * 0.2;
  }

  if (recommendation.side === selection.side) {
    return centered;
  }

  if (recommendation.side === null) {
    return centered * 0.35;
  }

  return -Math.abs(centered) * 0.75;
}

export function buildMarketEngineCandidateReasons(
  analysis: MarketAnalysis,
  selection: MarketSelection
): string[] {
  const aligned =
    analysis.recommendation.action === "lean" &&
    analysis.recommendation.side === selection.side;

  if (analysis.recommendation.action === "avoid") {
    return analysis.reasons.slice(0, 2).map((reason) => `${MARKET_ENGINE_INTEGRATION_REASON_PREFIX} ${reason}`);
  }

  if (!aligned && analysis.recommendation.action === "lean") {
    return [
      `${MARKET_ENGINE_INTEGRATION_REASON_PREFIX} Market leans ${analysis.recommendation.side ?? "neutral"} (${analysis.recommendation.label}).`,
    ];
  }

  return analysis.reasons
    .slice(0, 3)
    .map((reason) => `${MARKET_ENGINE_INTEGRATION_REASON_PREFIX} ${reason}`);
}

export function buildMarketEngineCandidateWarnings(
  analysis: MarketAnalysis
): string[] {
  const warnings: string[] = [];

  if (analysis.recommendation.action === "avoid") {
    warnings.push(`${MARKET_ENGINE_INTEGRATION_REASON_PREFIX} ${analysis.recommendation.label}.`);
  }

  if (analysis.riskLevel === "high") {
    warnings.push(`${MARKET_ENGINE_INTEGRATION_REASON_PREFIX} Elevated market risk detected.`);
  }

  return warnings;
}

export interface MarketEngineRecommendationAdjustment {
  blendedScore: number;
  reasons: string[];
  warnings: string[];
}

export function applyMarketEngineToCandidate(input: {
  selection: MarketSelection;
  featureScore: number;
  marketAnalysisByType: Map<MarketEngineType, MarketAnalysis>;
  globalPass: boolean;
  marketBlendWeight?: number;
}): MarketEngineRecommendationAdjustment {
  const marketBlendWeight =
    input.marketBlendWeight ?? buildFallbackWeightConfig().marketBlendWeight;
  if (input.globalPass) {
    return {
      blendedScore: 0,
      reasons: [],
      warnings: [],
    };
  }

  const marketType = resolveEngineMarketType(input.selection);
  if (!marketType) {
    return {
      blendedScore: input.featureScore,
      reasons: [],
      warnings: [],
    };
  }

  const analysis = input.marketAnalysisByType.get(marketType);
  if (!analysis) {
    return {
      blendedScore: input.featureScore,
      reasons: [],
      warnings: [],
    };
  }

  const marketSideScore = computeMarketEngineSideScore(analysis, input.selection);
  const blendedScore = clampScore(
    blendFeatureAndMarketEngineScore(input.featureScore, marketSideScore, marketBlendWeight)
  );

  return {
    blendedScore,
    reasons: buildMarketEngineCandidateReasons(analysis, input.selection),
    warnings: buildMarketEngineCandidateWarnings(analysis),
  };
}

export function hasMarketEngineIntegratedReasons(
  reasons: string[],
  warnings: string[] = []
): boolean {
  const marker = MARKET_ENGINE_INTEGRATION_REASON_PREFIX;
  return (
    reasons.some((reason) => reason.startsWith(marker)) ||
    warnings.some((warning) => warning.startsWith(marker))
  );
}

export type { FeatureFusionResult, MarketAnalysisSnapshot };
