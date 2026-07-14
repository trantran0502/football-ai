import { clampConfidence, clampScore, convertRawOddsToImpliedProbability } from "@/lib/analysis/featureScore/oddsConversion";
import type { FeatureFusionResult, FusionFactorSummary, FusionSourceCategory } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import type { MarketSelection } from "@/types/match";
import type { RecommendationLevel } from "@/lib/recommendation/recommendationTypes";

export const MIN_OVERALL_CONFIDENCE = 0.45;
export const MAX_WARNINGS_BEFORE_PASS = 3;
export const MAX_CONFLICTS_BEFORE_PASS = 2;
export const MIN_TOTAL_FEATURES = 5;

export const PASS_SCORE_THRESHOLD = 15;
export const LOW_SCORE_THRESHOLD = 35;
export const MEDIUM_SCORE_THRESHOLD = 55;
export const HIGH_CONFIDENCE_THRESHOLD = 0.55;

export const MONEYLINE_WEIGHTS = {
  overall: 0.25,
  marketOdds: 0.2,
  recentForm: 0.2,
  homeAway: 0.2,
  goalsXg: 0.15,
} as const;

export const HANDICAP_WEIGHTS = {
  ...MONEYLINE_WEIGHTS,
  goalDifference: 0.1,
  homeAdvantage: 0.1,
  leagueStrength: 0.1,
} as const;

export const TOTAL_GOALS_WEIGHTS = {
  goalsXg: 0.3,
  scoringPattern: 0.25,
  averageGoals: 0.2,
  matchContext: 0.15,
  overall: 0.1,
} as const;

export const BTTS_WEIGHTS = {
  btts: 0.3,
  failedToScore: 0.2,
  cleanSheet: 0.15,
  goalsXg: 0.2,
  scoringPattern: 0.15,
} as const;

const FEATURE_LABELS: Record<string, string> = {
  "market_odds": "Market Odds",
  "recent_form.win_rate": "Win Rate",
  "recent_form.goal_difference": "Goal Difference",
  "recent_form.momentum": "Momentum",
  "recent_form.home_form": "Home Form",
  "recent_form.away_form": "Away Form",
  "recent_form.clean_sheet_rate": "Clean Sheet Rate",
  "recent_form.failed_to_score_rate": "Failed To Score Rate",
  "league_strength.league_rank": "League Rank",
  "league_strength.attack_strength": "Attack Strength",
  "home_away.home_advantage": "Home Advantage",
  "home_away.home_win_rate": "Home Win Rate",
  "home_away.away_win_rate": "Away Win Rate",
  "goals_xg.expected_goal_advantage": "Expected Goal Advantage",
  "goals_xg.home_xg": "Home xG",
  "goals_xg.away_xg": "Away xG",
  "scoring_pattern.combined_over_25": "Combined Over 2.5",
  "scoring_pattern.combined_btts": "Combined BTTS",
  "scoring_pattern.average_total_goals": "Average Total Goals",
  "scoring_pattern.home_btts": "Home BTTS",
  "scoring_pattern.away_btts": "Away BTTS",
  "scoring_pattern.failed_to_score_risk": "Failed To Score Risk",
  "scoring_pattern.clean_sheet_conflict": "Clean Sheet Conflict",
  "match_context.rest_advantage": "Rest Advantage",
  "match_context.weather_impact": "Weather Impact",
};

export function formatFeatureLabel(featureId: string): string {
  if (FEATURE_LABELS[featureId]) {
    return FEATURE_LABELS[featureId];
  }
  const suffix = featureId.includes(".") ? featureId.split(".").slice(1).join(".") : featureId;
  return suffix
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function collectKnownFactors(fusion: FeatureFusionResult): FusionFactorSummary[] {
  const byId = new Map<string, FusionFactorSummary>();
  for (const factor of [
    ...fusion.strongestFactors,
    ...fusion.weakestFactors,
    ...fusion.ignoredFeatures,
  ]) {
    byId.set(factor.id, factor);
  }
  return [...byId.values()];
}

export function getCategoryWeightedScore(
  fusion: FeatureFusionResult,
  category: FusionSourceCategory
): number {
  return fusion.categoryScores.find((item) => item.category === category)?.weightedScore ?? 0;
}

export function getCategoryConfidence(
  fusion: FeatureFusionResult,
  category: FusionSourceCategory
): number {
  return fusion.categoryScores.find((item) => item.category === category)?.confidence ?? 0;
}

export function findFactor(
  fusion: FeatureFusionResult,
  featureId: string
): FusionFactorSummary | undefined {
  return collectKnownFactors(fusion).find((factor) => factor.id === featureId);
}

export function findFactorScore(fusion: FeatureFusionResult, featureId: string): number {
  return findFactor(fusion, featureId)?.score ?? 0;
}

export function getTotalFeatureCount(fusion: FeatureFusionResult): number {
  return fusion.categoryScores.reduce((sum, category) => sum + category.featureCount, 0);
}

export function countFeatureConflicts(fusion: FeatureFusionResult): number {
  const conflictWarning = fusion.warnings.find((warning) => warning.code === "feature_conflict");
  const conflicts = conflictWarning?.details?.conflicts;
  return Array.isArray(conflicts) ? conflicts.length : 0;
}

export function hasMarketOddsFeature(fusion: FeatureFusionResult): boolean {
  return (
    fusion.categoryScores.find((category) => category.category === "marketOdds")?.featureCount ??
      0
  ) > 0;
}

export function hasMoneylineMarket(marketSelections: MarketSelection[]): boolean {
  return marketSelections.some(
    (selection) =>
      selection.marketType === "moneyline" &&
      selection.period === "full" &&
      (selection.side === "home" || selection.side === "away" || selection.side === "draw")
  );
}

export function resolveImpliedProbability(selection: MarketSelection): number | null {
  if (
    typeof selection.impliedProbability === "number" &&
    Number.isFinite(selection.impliedProbability)
  ) {
    return clampConfidence(selection.impliedProbability);
  }
  return convertRawOddsToImpliedProbability(selection.odds);
}

export function resolveDecimalOdds(selection: MarketSelection): number | null {
  const raw = selection.odds;
  if (!Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  return raw >= 1.01 ? raw : raw + 1;
}

export function evaluateGlobalPass(
  fusion: FeatureFusionResult,
  marketSelections: MarketSelection[]
): { pass: boolean; reason: string | null } {
  if (fusion.overallConfidence < MIN_OVERALL_CONFIDENCE) {
    return {
      pass: true,
      reason: "Overall fusion confidence is below the minimum threshold.",
    };
  }

  if (countFeatureConflicts(fusion) > MAX_CONFLICTS_BEFORE_PASS) {
    return {
      pass: true,
      reason: "Too many conflicting feature signals were detected.",
    };
  }

  if (fusion.warnings.length > MAX_WARNINGS_BEFORE_PASS) {
    return {
      pass: true,
      reason: "Too many fusion warnings reduce recommendation reliability.",
    };
  }

  if (!hasMarketOddsFeature(fusion)) {
    return {
      pass: true,
      reason: "Market odds feature is missing from the fusion result.",
    };
  }

  if (!hasMoneylineMarket(marketSelections)) {
    return {
      pass: true,
      reason: "Moneyline market selections are missing.",
    };
  }

  if (getTotalFeatureCount(fusion) < MIN_TOTAL_FEATURES) {
    return {
      pass: true,
      reason: "Too few active features are available for recommendation.",
    };
  }

  if (fusion.warnings.some((warning) => warning.code === "insufficient_data")) {
    return {
      pass: true,
      reason: "Fusion reported insufficient data.",
    };
  }

  return { pass: false, reason: null };
}

export function directionalMultiplier(
  side: MarketSelection["side"],
  marketType: MarketSelection["marketType"]
): number {
  if (marketType === "moneyline" || marketType === "handicap") {
    if (side === "away") {
      return -1;
    }
    if (side === "draw") {
      return 0;
    }
    return 1;
  }

  if (marketType === "totalGoals") {
    return side === "under" ? -1 : 1;
  }

  if (marketType === "btts") {
    return side === "no" ? -1 : 1;
  }

  return 1;
}

export function scoreMoneyline(
  fusion: FeatureFusionResult,
  direction: number
): { score: number; supportingFeatures: string[]; reasons: string[] } {
  const categoryScore =
    direction *
    (MONEYLINE_WEIGHTS.overall * fusion.overallScore +
      MONEYLINE_WEIGHTS.marketOdds * getCategoryWeightedScore(fusion, "marketOdds") +
      MONEYLINE_WEIGHTS.recentForm * getCategoryWeightedScore(fusion, "recentForm") +
      MONEYLINE_WEIGHTS.homeAway * getCategoryWeightedScore(fusion, "homeAway") +
      MONEYLINE_WEIGHTS.goalsXg * getCategoryWeightedScore(fusion, "goalsXg"));

  const factorIds = [
    "market_odds",
    "recent_form.win_rate",
    "recent_form.momentum",
    "home_away.home_advantage",
    "goals_xg.expected_goal_advantage",
  ];
  const supportingFeatures: string[] = [];
  const reasons: string[] = [];

  for (const featureId of factorIds) {
    const factor = findFactor(fusion, featureId);
    if (!factor) {
      continue;
    }
    const contribution = direction * factor.score;
    if (contribution > 0) {
      supportingFeatures.push(formatFeatureLabel(featureId));
      reasons.push(`${formatFeatureLabel(featureId)} supports this side (${factor.score.toFixed(1)}).`);
    }
  }

  const factorBoost = factorIds.reduce((sum, featureId) => {
    const factor = findFactor(fusion, featureId);
    if (!factor) {
      return sum;
    }
    const contribution = direction * factor.score;
    return contribution > 0 ? sum + contribution * 0.12 : sum;
  }, 0);

  if (Math.abs(fusion.overallScore) >= 10) {
    reasons.push(`Overall fusion score leans ${fusion.overallScore > 0 ? "home" : "away"} (${fusion.overallScore.toFixed(1)}).`);
  }

  return {
    score: clampScore(categoryScore + factorBoost),
    supportingFeatures,
    reasons,
  };
}

export function scoreHandicap(
  fusion: FeatureFusionResult,
  direction: number
): { score: number; supportingFeatures: string[]; reasons: string[] } {
  const base = scoreMoneyline(fusion, direction);
  const goalDifference = direction * findFactorScore(fusion, "recent_form.goal_difference");
  const homeAdvantage = direction * findFactorScore(fusion, "home_away.home_advantage");
  const leagueStrength = direction * getCategoryWeightedScore(fusion, "leagueStrength");

  const score = clampScore(
    base.score * 0.7 +
      goalDifference * HANDICAP_WEIGHTS.goalDifference +
      homeAdvantage * HANDICAP_WEIGHTS.homeAdvantage +
      leagueStrength * HANDICAP_WEIGHTS.leagueStrength
  );

  const supportingFeatures = [...base.supportingFeatures];
  const reasons = [...base.reasons];

  if (goalDifference > 0) {
    supportingFeatures.push(formatFeatureLabel("recent_form.goal_difference"));
    reasons.push("Recent goal difference supports the handicap side.");
  }
  if (homeAdvantage > 0) {
    supportingFeatures.push(formatFeatureLabel("home_away.home_advantage"));
    reasons.push("Home advantage aligns with the handicap selection.");
  }
  if (Math.abs(leagueStrength) > 5) {
    supportingFeatures.push("League Strength");
    reasons.push("League strength context supports the handicap read.");
  }

  return { score, supportingFeatures: uniqueStrings(supportingFeatures), reasons };
}

export function scoreTotalGoals(
  fusion: FeatureFusionResult,
  direction: number
): { score: number; supportingFeatures: string[]; reasons: string[] } {
  const goalsXg = direction * getCategoryWeightedScore(fusion, "goalsXg");
  const scoringPattern = direction * getCategoryWeightedScore(fusion, "scoringPattern");
  const matchContext = direction * getCategoryWeightedScore(fusion, "matchContext");
  const averageGoals = direction * findFactorScore(fusion, "scoring_pattern.average_total_goals");
  const combinedOver = direction * findFactorScore(fusion, "scoring_pattern.combined_over_25");

  const score = clampScore(
    goalsXg * TOTAL_GOALS_WEIGHTS.goalsXg +
      scoringPattern * TOTAL_GOALS_WEIGHTS.scoringPattern +
      averageGoals * TOTAL_GOALS_WEIGHTS.averageGoals +
      matchContext * TOTAL_GOALS_WEIGHTS.matchContext +
      direction * fusion.overallScore * TOTAL_GOALS_WEIGHTS.overall +
      combinedOver * 0.1
  );

  const supportingFeatures: string[] = [];
  const reasons: string[] = [];

  for (const [featureId, label] of [
    ["goals_xg.expected_goal_advantage", "Expected Goal Advantage"],
    ["scoring_pattern.combined_over_25", "Combined Over 2.5"],
    ["scoring_pattern.average_total_goals", "Average Total Goals"],
    ["match_context.rest_advantage", "Rest Advantage"],
  ] as const) {
    const factor = findFactor(fusion, featureId);
    if (factor && direction * factor.score > 0) {
      supportingFeatures.push(label);
      reasons.push(`${label} supports the ${direction > 0 ? "over" : "under"} side.`);
    }
  }

  if (Math.abs(goalsXg) > 5) {
    reasons.push("Goals / xG category leans toward this total-goals selection.");
  }

  return { score, supportingFeatures: uniqueStrings(supportingFeatures), reasons };
}

export function scoreBtts(
  fusion: FeatureFusionResult,
  direction: number
): { score: number; supportingFeatures: string[]; reasons: string[] } {
  const btts = direction * findFactorScore(fusion, "scoring_pattern.combined_btts");
  const failedToScore = direction * -findFactorScore(fusion, "scoring_pattern.failed_to_score_risk");
  const cleanSheet = direction * -findFactorScore(fusion, "scoring_pattern.clean_sheet_conflict");
  const goalsXg = direction * getCategoryWeightedScore(fusion, "goalsXg");
  const scoringPattern = direction * getCategoryWeightedScore(fusion, "scoringPattern");

  const score = clampScore(
    btts * BTTS_WEIGHTS.btts +
      failedToScore * BTTS_WEIGHTS.failedToScore +
      cleanSheet * BTTS_WEIGHTS.cleanSheet +
      goalsXg * BTTS_WEIGHTS.goalsXg +
      scoringPattern * BTTS_WEIGHTS.scoringPattern
  );

  const supportingFeatures: string[] = [];
  const reasons: string[] = [];

  for (const [featureId, label] of [
    ["scoring_pattern.combined_btts", "Combined BTTS"],
    ["scoring_pattern.failed_to_score_risk", "Failed To Score"],
    ["scoring_pattern.clean_sheet_conflict", "Clean Sheet"],
    ["goals_xg.home_xg", "Home xG"],
    ["goals_xg.away_xg", "Away xG"],
  ] as const) {
    const factor = findFactor(fusion, featureId);
    if (!factor) {
      continue;
    }
    const contribution =
      featureId === "scoring_pattern.failed_to_score_risk" ||
      featureId === "scoring_pattern.clean_sheet_conflict"
        ? direction * -factor.score
        : direction * factor.score;
    if (contribution > 0) {
      supportingFeatures.push(label);
      reasons.push(`${label} supports BTTS ${direction > 0 ? "Yes" : "No"}.`);
    }
  }

  return { score, supportingFeatures: uniqueStrings(supportingFeatures), reasons };
}

export function scoreToLevel(
  score: number,
  fusionConfidence: number,
  globalPass: boolean
): RecommendationLevel {
  if (globalPass) {
    return "pass";
  }

  const magnitude = Math.abs(score);
  if (magnitude < PASS_SCORE_THRESHOLD) {
    return "pass";
  }
  if (magnitude < LOW_SCORE_THRESHOLD) {
    return "low";
  }
  if (magnitude < MEDIUM_SCORE_THRESHOLD) {
    return "medium";
  }
  return fusionConfidence >= HIGH_CONFIDENCE_THRESHOLD ? "high" : "medium";
}

export function computeExpectedValue(
  selection: MarketSelection,
  score: number
): number {
  const implied = resolveImpliedProbability(selection);
  const decimalOdds = resolveDecimalOdds(selection);
  if (implied === null || decimalOdds === null) {
    return 0;
  }

  const edgeShift = (score / 100) * 0.12;
  const adjustedProbability = clampConfidence(implied + edgeShift);
  return Number((adjustedProbability * decimalOdds - 1).toFixed(4));
}

export function buildFusionWarnings(fusion: FeatureFusionResult): string[] {
  return fusion.warnings.map((warning) => warning.message);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
