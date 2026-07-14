import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import { clampScore } from "@/lib/analysis/featureScore/oddsConversion";
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
    return generateRecommendations(input.fusion, input.marketSelections, this.options);
  }
}

export function generateRecommendations(
  fusion: FeatureFusionResult,
  marketSelections: MarketSelection[],
  _options: RecommendationEngineOptions = {}
): RecommendationEngineResult {
  const passGate = evaluateGlobalPass(fusion, marketSelections);
  const fusionWarnings = buildFusionWarnings(fusion);

  const candidates = marketSelections
    .filter((selection) => isSupportedSelection(selection))
    .map((selection) =>
      buildCandidate(selection, fusion, passGate.pass, fusionWarnings, passGate.reason)
    );

  return {
    candidates,
    globalPass: passGate.pass,
    passReason: passGate.reason,
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
  globalPass: boolean,
  fusionWarnings: string[],
  passReason: string | null
): RecommendationCandidate {
  const direction = directionalMultiplier(selection.side, selection.marketType);
  const scored = scoreSelection(selection, fusion, direction);
  const level = scoreToLevel(scored.score, fusion.overallConfidence, globalPass);
  const expectedValue = globalPass || level === "pass" ? 0 : computeExpectedValue(selection, scored.score);

  const warnings = [...fusionWarnings];
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
    score: globalPass ? 0 : clampScore(scored.score),
    reasons: globalPass ? [] : scored.reasons,
    warnings: uniqueStrings(warnings),
    supportingFeatures: globalPass ? [] : scored.supportingFeatures,
  };
}

function scoreSelection(
  selection: MarketSelection,
  fusion: FeatureFusionResult,
  direction: number
): { score: number; supportingFeatures: string[]; reasons: string[] } {
  if (direction === 0) {
    return scoreDraw(fusion);
  }

  switch (selection.marketType) {
    case "moneyline":
      return scoreMoneyline(fusion, direction);
    case "handicap":
      return scoreHandicap(fusion, direction);
    case "totalGoals":
      return scoreTotalGoals(fusion, direction);
    case "btts":
      return scoreBtts(fusion, direction);
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
