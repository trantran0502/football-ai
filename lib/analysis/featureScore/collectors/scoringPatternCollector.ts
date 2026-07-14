import { clampConfidence, clampScore } from "@/lib/analysis/featureScore/oddsConversion";
import { getFeatureWeight } from "@/lib/analysis/featureScore/featureWeights";
import { registerFeatureCollector } from "@/lib/analysis/featureScore/featureScoreEngine";
import { createRegistryScoringPatternProvider } from "@/lib/providers/registry/createRegistryProviders";
import {
  type ScoringPatternProvider,
  type ScoringPatternSnapshot,
  type TeamScoringPatternMetrics,
} from "@/lib/analysis/featureScore/providers/scoringPatternProvider";
import type {
  FeatureScore,
  FeatureScoreCategory,
  FeatureScoreContext,
} from "@/lib/analysis/featureScore/types";

export const SCORING_PATTERN_FEATURE_IDS = {
  homeOver15: "scoring_pattern.home_over_15",
  awayOver15: "scoring_pattern.away_over_15",
  homeOver25: "scoring_pattern.home_over_25",
  awayOver25: "scoring_pattern.away_over_25",
  combinedOver25: "scoring_pattern.combined_over_25",
  combinedOver35: "scoring_pattern.combined_over_35",
  homeBtts: "scoring_pattern.home_btts",
  awayBtts: "scoring_pattern.away_btts",
  combinedBtts: "scoring_pattern.combined_btts",
  cleanSheetConflict: "scoring_pattern.clean_sheet_conflict",
  failedToScoreRisk: "scoring_pattern.failed_to_score_risk",
  averageTotalGoals: "scoring_pattern.average_total_goals",
  firstHalfGoalTendency: "scoring_pattern.first_half_goal_tendency",
} as const;

export type ScoringPatternFeatureId =
  (typeof SCORING_PATTERN_FEATURE_IDS)[keyof typeof SCORING_PATTERN_FEATURE_IDS];

export interface ScoringPatternFeatureMetadata {
  label: string;
  homeValue: number | null;
  awayValue: number | null;
  combinedValue: number | null;
  effectiveSampleSize: number;
}

const NEUTRAL_RATE = 0.5;
const NEUTRAL_TOTAL_GOALS = 2.5;

let registered = false;
let defaultProvider: ScoringPatternProvider = createRegistryScoringPatternProvider();

export function registerScoringPatternCollector(): void {
  if (registered) {
    return;
  }
  registerFeatureCollector(collectScoringPatternFeatures);
  registered = true;
}

export function resetScoringPatternCollectorRegistrationForTests(): void {
  registered = false;
}

export function isScoringPatternCollectorRegistered(): boolean {
  return registered;
}

export function resetScoringPatternProviderForTests(): void {
  defaultProvider = createRegistryScoringPatternProvider();
}

export function setScoringPatternProviderForTests(
  provider: ScoringPatternProvider
): void {
  defaultProvider = provider;
}

function resolveProvider(context: FeatureScoreContext): ScoringPatternProvider {
  const injected = context.metadata?.scoringPatternProvider;
  if (
    injected &&
    typeof injected === "object" &&
    "getScoringPattern" in injected
  ) {
    return injected as ScoringPatternProvider;
  }
  return defaultProvider;
}

function resolveTeamNames(context: FeatureScoreContext): {
  homeTeam: string | null;
  awayTeam: string | null;
} {
  const homeTeam = context.metadata?.homeTeam;
  const awayTeam = context.metadata?.awayTeam;

  return {
    homeTeam: typeof homeTeam === "string" && homeTeam.trim() ? homeTeam.trim() : null,
    awayTeam: typeof awayTeam === "string" && awayTeam.trim() ? awayTeam.trim() : null,
  };
}

function sampleSizeCap(sampleSize: number): number {
  if (sampleSize < 5) {
    return 0.35;
  }
  if (sampleSize < 10) {
    return 0.65;
  }
  return 0.9;
}

function resolveConfidence(
  sampleSize: number,
  fieldsAvailable: number,
  fieldsRequired: number
): number {
  const cap = sampleSizeCap(sampleSize);
  if (fieldsAvailable <= 0 || fieldsRequired <= 0) {
    return clampConfidence(0.2);
  }

  const completeness = fieldsAvailable / fieldsRequired;
  const scaled = 0.25 + completeness * (cap - 0.15);
  return clampConfidence(Math.min(cap, scaled));
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 1000) / 1000;
}

function rateToOverScore(rate: number): number {
  return clampScore((rate - NEUTRAL_RATE) * 200);
}

function rateToBttsScore(rate: number): number {
  return clampScore((rate - NEUTRAL_RATE) * 200);
}

function buildMetadata(
  label: string,
  homeValue: number | null,
  awayValue: number | null,
  combinedValue: number | null,
  effectiveSampleSize: number
): ScoringPatternFeatureMetadata {
  return {
    label,
    homeValue,
    awayValue,
    combinedValue,
    effectiveSampleSize,
  };
}

function buildFeature(
  id: ScoringPatternFeatureId,
  label: string,
  category: FeatureScoreCategory,
  score: number,
  reason: string,
  metadata: ScoringPatternFeatureMetadata,
  confidence: number
): FeatureScore {
  return {
    id,
    category,
    score: clampScore(score),
    weight: getFeatureWeight("scoringPattern"),
    confidence: clampConfidence(confidence),
    reason,
    metadata: { ...metadata },
  };
}

function teamSampleSize(team: TeamScoringPatternMetrics): number {
  return team.sampleSize > 0 ? team.sampleSize : 0;
}

function scoreTeamOverRate(
  id: ScoringPatternFeatureId,
  label: string,
  team: TeamScoringPatternMetrics,
  rate: number | null,
  side: "home" | "away"
): FeatureScore | null {
  if (rate === null || teamSampleSize(team) <= 0) {
    return null;
  }

  const homeValue = side === "home" ? rate : null;
  const awayValue = side === "away" ? rate : null;

  return buildFeature(
    id,
    label,
    "totalGoals",
    rateToOverScore(rate),
    `${side === "home" ? "主隊" : "客隊"}${label} 比率 ${(rate * 100).toFixed(1)}%（大球傾向為正分）。`,
    buildMetadata(label, homeValue, awayValue, rate, teamSampleSize(team)),
    resolveConfidence(teamSampleSize(team), 1, 1)
  );
}

function scoreCombinedOverRate(
  id: ScoringPatternFeatureId,
  label: string,
  snapshot: ScoringPatternSnapshot,
  pickRate: (team: TeamScoringPatternMetrics) => number | null
): FeatureScore | null {
  const homeRate = pickRate(snapshot.home);
  const awayRate = pickRate(snapshot.away);

  if (homeRate === null || awayRate === null) {
    return null;
  }

  const combined = average([homeRate, awayRate]);
  if (combined === null) {
    return null;
  }

  const effectiveSampleSize = Math.min(
    teamSampleSize(snapshot.home),
    teamSampleSize(snapshot.away)
  );
  if (effectiveSampleSize <= 0) {
    return null;
  }

  return buildFeature(
    id,
    label,
    "totalGoals",
    rateToOverScore(combined),
    `${label} 綜合比率 ${(combined * 100).toFixed(1)}%（大球傾向為正分）。`,
    buildMetadata(label, homeRate, awayRate, combined, effectiveSampleSize),
    resolveConfidence(effectiveSampleSize, 2, 2)
  );
}

function scoreTeamBtts(
  id: ScoringPatternFeatureId,
  label: string,
  team: TeamScoringPatternMetrics,
  side: "home" | "away"
): FeatureScore | null {
  if (team.bttsRate === null || teamSampleSize(team) <= 0) {
    return null;
  }

  return buildFeature(
    id,
    label,
    "btts",
    rateToBttsScore(team.bttsRate),
    `${side === "home" ? "主隊" : "客隊"} BTTS 比率 ${(team.bttsRate * 100).toFixed(1)}%（Yes 傾向為正分）。`,
    buildMetadata(
      label,
      side === "home" ? team.bttsRate : null,
      side === "away" ? team.bttsRate : null,
      team.bttsRate,
      teamSampleSize(team)
    ),
    resolveConfidence(teamSampleSize(team), 1, 1)
  );
}

function scoreCombinedBtts(snapshot: ScoringPatternSnapshot): FeatureScore | null {
  if (
    snapshot.home.bttsRate === null ||
    snapshot.away.bttsRate === null ||
    teamSampleSize(snapshot.home) <= 0 ||
    teamSampleSize(snapshot.away) <= 0
  ) {
    return null;
  }

  const combined = average([snapshot.home.bttsRate, snapshot.away.bttsRate]);
  if (combined === null) {
    return null;
  }

  const effectiveSampleSize = Math.min(
    teamSampleSize(snapshot.home),
    teamSampleSize(snapshot.away)
  );

  return buildFeature(
    SCORING_PATTERN_FEATURE_IDS.combinedBtts,
    "Combined BTTS",
    "btts",
    rateToBttsScore(combined),
    `Combined BTTS 比率 ${(combined * 100).toFixed(1)}%（Yes 傾向為正分）。`,
    buildMetadata(
      "Combined BTTS",
      snapshot.home.bttsRate,
      snapshot.away.bttsRate,
      combined,
      effectiveSampleSize
    ),
    resolveConfidence(effectiveSampleSize, 2, 2)
  );
}

function scoreCleanSheetConflict(snapshot: ScoringPatternSnapshot): FeatureScore | null {
  const {
    home: { bttsRate: homeBtts, cleanSheetRate: homeCleanSheet },
    away: { bttsRate: awayBtts, cleanSheetRate: awayCleanSheet },
  } = snapshot;

  if (
    homeBtts === null ||
    awayBtts === null ||
    homeCleanSheet === null ||
    awayCleanSheet === null ||
    teamSampleSize(snapshot.home) <= 0 ||
    teamSampleSize(snapshot.away) <= 0
  ) {
    return null;
  }

  const bttsSignal = average([homeBtts, awayBtts]) ?? NEUTRAL_RATE;
  const cleanSheetSignal = average([homeCleanSheet, awayCleanSheet]) ?? NEUTRAL_RATE;
  const bttsScore = bttsSignal - NEUTRAL_RATE;
  const underSignal = cleanSheetSignal - NEUTRAL_RATE;
  const conflictGap = Math.abs(bttsScore + underSignal);

  const score = clampScore((bttsScore - underSignal) * 100);
  const effectiveSampleSize = Math.min(
    teamSampleSize(snapshot.home),
    teamSampleSize(snapshot.away)
  );

  let confidence = resolveConfidence(effectiveSampleSize, 4, 4);
  if (conflictGap > 0.25) {
    confidence = clampConfidence(confidence * 0.7);
  }

  return buildFeature(
    SCORING_PATTERN_FEATURE_IDS.cleanSheetConflict,
    "Clean Sheet Conflict",
    "btts",
    score,
    conflictGap > 0.25
      ? `BTTS 與零封率訊號不一致（差距 ${(conflictGap * 100).toFixed(1)}%），僅供特徵參考。`
      : `BTTS 與零封率訊號一致，偏向 ${score >= 0 ? "BTTS Yes / 大球" : "BTTS No / 小球"} 環境。`,
    buildMetadata(
      "Clean Sheet Conflict",
      homeCleanSheet,
      awayCleanSheet,
      conflictGap,
      effectiveSampleSize
    ),
    confidence
  );
}

function scoreFailedToScoreRisk(snapshot: ScoringPatternSnapshot): FeatureScore | null {
  const homeRate = snapshot.home.failedToScoreRate;
  const awayRate = snapshot.away.failedToScoreRate;

  if (homeRate === null || awayRate === null) {
    return null;
  }
  if (teamSampleSize(snapshot.home) <= 0 || teamSampleSize(snapshot.away) <= 0) {
    return null;
  }

  const combined = average([homeRate, awayRate]);
  if (combined === null) {
    return null;
  }

  const score = clampScore((NEUTRAL_RATE - combined) * 200);
  const effectiveSampleSize = Math.min(
    teamSampleSize(snapshot.home),
    teamSampleSize(snapshot.away)
  );

  return buildFeature(
    SCORING_PATTERN_FEATURE_IDS.failedToScoreRisk,
    "Failed To Score Risk",
    "btts",
    score,
    `未進球風險綜合 ${(combined * 100).toFixed(1)}%（偏高偏向 BTTS No / 小球）。`,
    buildMetadata(
      "Failed To Score Risk",
      homeRate,
      awayRate,
      combined,
      effectiveSampleSize
    ),
    resolveConfidence(effectiveSampleSize, 2, 2)
  );
}

function scoreAverageTotalGoals(snapshot: ScoringPatternSnapshot): FeatureScore | null {
  const homeValue = snapshot.home.averageTotalGoals;
  const awayValue = snapshot.away.averageTotalGoals;

  if (homeValue === null || awayValue === null) {
    return null;
  }
  if (teamSampleSize(snapshot.home) <= 0 || teamSampleSize(snapshot.away) <= 0) {
    return null;
  }

  const combined = average([homeValue, awayValue]);
  if (combined === null) {
    return null;
  }

  const score = clampScore((combined - NEUTRAL_TOTAL_GOALS) * 40);
  const effectiveSampleSize = Math.min(
    teamSampleSize(snapshot.home),
    teamSampleSize(snapshot.away)
  );

  return buildFeature(
    SCORING_PATTERN_FEATURE_IDS.averageTotalGoals,
    "Average Total Goals",
    "totalGoals",
    score,
    `場均總進球 ${combined.toFixed(2)}（大球傾向為正分）。`,
    buildMetadata(
      "Average Total Goals",
      homeValue,
      awayValue,
      combined,
      effectiveSampleSize
    ),
    resolveConfidence(effectiveSampleSize, 2, 2)
  );
}

function scoreFirstHalfGoalTendency(snapshot: ScoringPatternSnapshot): FeatureScore | null {
  const homeRates = [
    snapshot.home.firstHalfOver05Rate,
    snapshot.home.firstHalfOver15Rate,
  ].filter((value): value is number => value !== null);
  const awayRates = [
    snapshot.away.firstHalfOver05Rate,
    snapshot.away.firstHalfOver15Rate,
  ].filter((value): value is number => value !== null);

  if (homeRates.length === 0 && awayRates.length === 0) {
    return null;
  }

  const homeCombined = average(homeRates);
  const awayCombined = average(awayRates);
  const values = [homeCombined, awayCombined].filter(
    (value): value is number => value !== null
  );
  const combined = average(values);

  if (combined === null) {
    return null;
  }

  const effectiveSampleSize = Math.min(
    teamSampleSize(snapshot.home),
    teamSampleSize(snapshot.away)
  );
  if (effectiveSampleSize <= 0) {
    return null;
  }

  const fieldsAvailable =
    (snapshot.home.firstHalfOver05Rate !== null ? 1 : 0) +
    (snapshot.home.firstHalfOver15Rate !== null ? 1 : 0) +
    (snapshot.away.firstHalfOver05Rate !== null ? 1 : 0) +
    (snapshot.away.firstHalfOver15Rate !== null ? 1 : 0);

  return buildFeature(
    SCORING_PATTERN_FEATURE_IDS.firstHalfGoalTendency,
    "First-Half Goal Tendency",
    "totalGoals",
    rateToOverScore(combined),
    `上半場進球傾向 ${(combined * 100).toFixed(1)}%（大球傾向為正分）。`,
    buildMetadata(
      "First-Half Goal Tendency",
      homeCombined,
      awayCombined,
      combined,
      effectiveSampleSize
    ),
    resolveConfidence(effectiveSampleSize, fieldsAvailable, 4)
  );
}

function compactFeatures(features: Array<FeatureScore | null>): FeatureScore[] {
  return features.filter((feature): feature is FeatureScore => feature !== null);
}

export function collectScoringPatternFeatures(
  context: FeatureScoreContext
): FeatureScore[] {
  const { homeTeam, awayTeam } = resolveTeamNames(context);
  if (!homeTeam || !awayTeam) {
    return [];
  }

  const provider = resolveProvider(context);
  const snapshot = provider.getScoringPattern({ homeTeam, awayTeam });

  return compactFeatures([
    scoreTeamOverRate(
      SCORING_PATTERN_FEATURE_IDS.homeOver15,
      "Home Over 1.5",
      snapshot.home,
      snapshot.home.over15Rate,
      "home"
    ),
    scoreTeamOverRate(
      SCORING_PATTERN_FEATURE_IDS.awayOver15,
      "Away Over 1.5",
      snapshot.away,
      snapshot.away.over15Rate,
      "away"
    ),
    scoreTeamOverRate(
      SCORING_PATTERN_FEATURE_IDS.homeOver25,
      "Home Over 2.5",
      snapshot.home,
      snapshot.home.over25Rate,
      "home"
    ),
    scoreTeamOverRate(
      SCORING_PATTERN_FEATURE_IDS.awayOver25,
      "Away Over 2.5",
      snapshot.away,
      snapshot.away.over25Rate,
      "away"
    ),
    scoreCombinedOverRate(
      SCORING_PATTERN_FEATURE_IDS.combinedOver25,
      "Combined Over 2.5",
      snapshot,
      (team) => team.over25Rate
    ),
    scoreCombinedOverRate(
      SCORING_PATTERN_FEATURE_IDS.combinedOver35,
      "Combined Over 3.5",
      snapshot,
      (team) => team.over35Rate
    ),
    scoreTeamBtts(
      SCORING_PATTERN_FEATURE_IDS.homeBtts,
      "Home BTTS",
      snapshot.home,
      "home"
    ),
    scoreTeamBtts(
      SCORING_PATTERN_FEATURE_IDS.awayBtts,
      "Away BTTS",
      snapshot.away,
      "away"
    ),
    scoreCombinedBtts(snapshot),
    scoreCleanSheetConflict(snapshot),
    scoreFailedToScoreRisk(snapshot),
    scoreAverageTotalGoals(snapshot),
    scoreFirstHalfGoalTendency(snapshot),
  ]);
}
