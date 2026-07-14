import { clampConfidence, clampScore } from "@/lib/analysis/featureScore/oddsConversion";
import { getFeatureWeight } from "@/lib/analysis/featureScore/featureWeights";
import { registerFeatureCollector } from "@/lib/analysis/featureScore/featureScoreEngine";
import {
  createRegistryRecentFormProvider,
} from "@/lib/providers/registry/createRegistryProviders";
import type {
  RecentFormProvider,
  RecentFormTeamSnapshot,
} from "@/lib/analysis/featureScore/providers/recentFormProvider";
import type {
  FeatureScore,
  FeatureScoreCategory,
  FeatureScoreContext,
} from "@/lib/analysis/featureScore/types";

export const RECENT_FORM_FEATURE_IDS = {
  winRate: "recent_form.win_rate",
  goalDifference: "recent_form.goal_difference",
  goalsScored: "recent_form.goals_scored",
  goalsConceded: "recent_form.goals_conceded",
  homeForm: "recent_form.home_form",
  awayForm: "recent_form.away_form",
  momentum: "recent_form.momentum",
  cleanSheetRate: "recent_form.clean_sheet_rate",
  failedToScoreRate: "recent_form.failed_to_score_rate",
} as const;

export type RecentFormFeatureId =
  (typeof RECENT_FORM_FEATURE_IDS)[keyof typeof RECENT_FORM_FEATURE_IDS];

export interface RecentFormFeatureMetadata {
  label: string;
  homeValue: number | null;
  awayValue: number | null;
  differential: number | null;
  homeSampleSize: number;
  awaySampleSize: number;
}

const FEATURE_DEFINITIONS: Array<{
  id: RecentFormFeatureId;
  label: string;
  category: FeatureScoreCategory;
}> = [
  { id: RECENT_FORM_FEATURE_IDS.winRate, label: "Win Rate", category: "moneyline" },
  {
    id: RECENT_FORM_FEATURE_IDS.goalDifference,
    label: "Goal Difference",
    category: "totalGoals",
  },
  {
    id: RECENT_FORM_FEATURE_IDS.goalsScored,
    label: "Goals Scored",
    category: "totalGoals",
  },
  {
    id: RECENT_FORM_FEATURE_IDS.goalsConceded,
    label: "Goals Conceded",
    category: "totalGoals",
  },
  { id: RECENT_FORM_FEATURE_IDS.homeForm, label: "Home Form", category: "moneyline" },
  { id: RECENT_FORM_FEATURE_IDS.awayForm, label: "Away Form", category: "moneyline" },
  { id: RECENT_FORM_FEATURE_IDS.momentum, label: "Momentum", category: "moneyline" },
  {
    id: RECENT_FORM_FEATURE_IDS.cleanSheetRate,
    label: "Clean Sheet Rate",
    category: "totalGoals",
  },
  {
    id: RECENT_FORM_FEATURE_IDS.failedToScoreRate,
    label: "Failed To Score Rate",
    category: "totalGoals",
  },
];

let registered = false;
let defaultProvider: RecentFormProvider = createRegistryRecentFormProvider();

export function registerRecentFormCollector(): void {
  if (registered) {
    return;
  }
  registerFeatureCollector(collectRecentFormFeatures);
  registered = true;
}

export function resetRecentFormCollectorRegistrationForTests(): void {
  registered = false;
}

export function isRecentFormCollectorRegistered(): boolean {
  return registered;
}

export function resetRecentFormProviderForTests(): void {
  defaultProvider = createRegistryRecentFormProvider();
}

export function setRecentFormProviderForTests(provider: RecentFormProvider): void {
  defaultProvider = provider;
}

function resolveProvider(context: FeatureScoreContext): RecentFormProvider {
  const injected = context.metadata?.recentFormProvider;
  if (injected && typeof injected === "object" && "getRecentForm" in injected) {
    return injected as RecentFormProvider;
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

function resolveConfidence(
  home: RecentFormTeamSnapshot,
  away: RecentFormTeamSnapshot
): number {
  const minSample = Math.min(home.sampleSize, away.sampleSize);
  if (minSample <= 0) {
    return clampConfidence(0.2);
  }
  if (minSample < 3) {
    return clampConfidence(0.35);
  }
  if (minSample < 5) {
    return clampConfidence(0.55);
  }
  return clampConfidence(0.75);
}

function buildIncompleteFeature(
  id: RecentFormFeatureId,
  label: string,
  category: FeatureScoreCategory,
  reason: string
): FeatureScore {
  return {
    id,
    category,
    score: 0,
    weight: getFeatureWeight("recentForm"),
    confidence: clampConfidence(0.2),
    reason,
    metadata: {
      label,
      homeValue: null,
      awayValue: null,
      differential: null,
      homeSampleSize: 0,
      awaySampleSize: 0,
    } satisfies RecentFormFeatureMetadata as Record<string, unknown>,
  };
}

function buildFeature(
  id: RecentFormFeatureId,
  label: string,
  category: FeatureScoreCategory,
  homeValue: number | null,
  awayValue: number | null,
  score: number,
  reason: string,
  home: RecentFormTeamSnapshot,
  away: RecentFormTeamSnapshot
): FeatureScore {
  const differential =
    homeValue !== null && awayValue !== null
      ? Math.round((homeValue - awayValue) * 1000) / 1000
      : null;

  return {
    id,
    category,
    score: clampScore(score),
    weight: getFeatureWeight("recentForm"),
    confidence: resolveConfidence(home, away),
    reason,
    metadata: {
      label,
      homeValue,
      awayValue,
      differential,
      homeSampleSize: home.sampleSize,
      awaySampleSize: away.sampleSize,
    } satisfies RecentFormFeatureMetadata as Record<string, unknown>,
  };
}

function scoreWinRateFeature(
  home: RecentFormTeamSnapshot,
  away: RecentFormTeamSnapshot
): FeatureScore {
  const def = FEATURE_DEFINITIONS[0];
  if (home.winRate === null || away.winRate === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Win Rate 樣本不足，無法計算勝率。"
    );
  }

  const diff = home.winRate - away.winRate;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    home.winRate,
    away.winRate,
    diff * 100,
    `主隊近況勝率 ${(home.winRate * 100).toFixed(1)}%，客隊 ${(away.winRate * 100).toFixed(1)}%。`,
    home,
    away
  );
}

function scoreGoalDifferenceFeature(
  home: RecentFormTeamSnapshot,
  away: RecentFormTeamSnapshot
): FeatureScore {
  const def = FEATURE_DEFINITIONS[1];
  if (home.goalDifferencePerMatch === null || away.goalDifferencePerMatch === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Goal Difference 樣本不足，無法計算場均淨勝球。"
    );
  }

  const diff = home.goalDifferencePerMatch - away.goalDifferencePerMatch;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    home.goalDifferencePerMatch,
    away.goalDifferencePerMatch,
    diff * 25,
    `主隊場均淨勝球 ${home.goalDifferencePerMatch.toFixed(2)}，客隊 ${away.goalDifferencePerMatch.toFixed(2)}。`,
    home,
    away
  );
}

function scoreGoalsScoredFeature(
  home: RecentFormTeamSnapshot,
  away: RecentFormTeamSnapshot
): FeatureScore {
  const def = FEATURE_DEFINITIONS[2];
  if (home.avgGoalsFor === null || away.avgGoalsFor === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Goals Scored 樣本不足，無法計算場均進球。"
    );
  }

  const diff = home.avgGoalsFor - away.avgGoalsFor;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    home.avgGoalsFor,
    away.avgGoalsFor,
    diff * 25,
    `主隊場均進球 ${home.avgGoalsFor.toFixed(2)}，客隊 ${away.avgGoalsFor.toFixed(2)}。`,
    home,
    away
  );
}

function scoreGoalsConcededFeature(
  home: RecentFormTeamSnapshot,
  away: RecentFormTeamSnapshot
): FeatureScore {
  const def = FEATURE_DEFINITIONS[3];
  if (home.avgGoalsAgainst === null || away.avgGoalsAgainst === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Goals Conceded 樣本不足，無法計算場均失球。"
    );
  }

  const diff = away.avgGoalsAgainst - home.avgGoalsAgainst;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    home.avgGoalsAgainst,
    away.avgGoalsAgainst,
    diff * 25,
    `主隊場均失球 ${home.avgGoalsAgainst.toFixed(2)}，客隊 ${away.avgGoalsAgainst.toFixed(2)}（較低較佳）。`,
    home,
    away
  );
}

function scoreHomeFormFeature(
  home: RecentFormTeamSnapshot,
  away: RecentFormTeamSnapshot
): FeatureScore {
  const def = FEATURE_DEFINITIONS[4];
  if (home.venueWinRate === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Home Form 缺少主場勝率資料。"
    );
  }

  const baseline = away.venueWinRate ?? 0.5;
  const diff = home.venueWinRate - baseline;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    home.venueWinRate,
    away.venueWinRate,
    diff * 100,
    `主隊主場勝率 ${(home.venueWinRate * 100).toFixed(1)}%。`,
    home,
    away
  );
}

function scoreAwayFormFeature(
  home: RecentFormTeamSnapshot,
  away: RecentFormTeamSnapshot
): FeatureScore {
  const def = FEATURE_DEFINITIONS[5];
  if (away.venueWinRate === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Away Form 缺少客場勝率資料。"
    );
  }

  const baseline = home.venueWinRate ?? 0.5;
  const diff = baseline - away.venueWinRate;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    home.venueWinRate,
    away.venueWinRate,
    diff * 100,
    `客隊客場勝率 ${(away.venueWinRate * 100).toFixed(1)}%（客隊客場越強，主隊得分越低）。`,
    home,
    away
  );
}

function scoreMomentumFeature(
  home: RecentFormTeamSnapshot,
  away: RecentFormTeamSnapshot
): FeatureScore {
  const def = FEATURE_DEFINITIONS[6];
  if (home.momentum === null || away.momentum === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Momentum 缺少趨勢資料。"
    );
  }

  const diff = home.momentum - away.momentum;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    home.momentum,
    away.momentum,
    diff * 50,
    `主隊動能 ${home.momentum.toFixed(2)}，客隊 ${away.momentum.toFixed(2)}。`,
    home,
    away
  );
}

function scoreCleanSheetRateFeature(
  home: RecentFormTeamSnapshot,
  away: RecentFormTeamSnapshot
): FeatureScore {
  const def = FEATURE_DEFINITIONS[7];
  if (home.cleanSheetRate === null || away.cleanSheetRate === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Clean Sheet Rate 樣本不足。"
    );
  }

  const diff = home.cleanSheetRate - away.cleanSheetRate;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    home.cleanSheetRate,
    away.cleanSheetRate,
    diff * 100,
    `主隊零封率 ${(home.cleanSheetRate * 100).toFixed(1)}%，客隊 ${(away.cleanSheetRate * 100).toFixed(1)}%。`,
    home,
    away
  );
}

function scoreFailedToScoreRateFeature(
  home: RecentFormTeamSnapshot,
  away: RecentFormTeamSnapshot
): FeatureScore {
  const def = FEATURE_DEFINITIONS[8];
  if (home.failedToScoreRate === null || away.failedToScoreRate === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Failed To Score Rate 樣本不足。"
    );
  }

  const diff = away.failedToScoreRate - home.failedToScoreRate;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    home.failedToScoreRate,
    away.failedToScoreRate,
    diff * 100,
    `主隊未進球率 ${(home.failedToScoreRate * 100).toFixed(1)}%，客隊 ${(away.failedToScoreRate * 100).toFixed(1)}%（較低較佳）。`,
    home,
    away
  );
}

function buildMissingTeamsFeatures(reason: string): FeatureScore[] {
  return FEATURE_DEFINITIONS.map((def) =>
    buildIncompleteFeature(def.id, def.label, def.category, reason)
  );
}

export function collectRecentFormFeatures(
  context: FeatureScoreContext
): FeatureScore[] {
  const { homeTeam, awayTeam } = resolveTeamNames(context);
  if (!homeTeam || !awayTeam) {
    return buildMissingTeamsFeatures("缺少主隊或客隊名稱，無法評估 Recent Form。");
  }

  const provider = resolveProvider(context);
  const matchup = provider.getRecentForm({ homeTeam, awayTeam });
  const { home, away } = matchup;

  return [
    scoreWinRateFeature(home, away),
    scoreGoalDifferenceFeature(home, away),
    scoreGoalsScoredFeature(home, away),
    scoreGoalsConcededFeature(home, away),
    scoreHomeFormFeature(home, away),
    scoreAwayFormFeature(home, away),
    scoreMomentumFeature(home, away),
    scoreCleanSheetRateFeature(home, away),
    scoreFailedToScoreRateFeature(home, away),
  ];
}
