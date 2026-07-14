import { clampConfidence, clampScore } from "@/lib/analysis/featureScore/oddsConversion";
import { getFeatureWeight } from "@/lib/analysis/featureScore/featureWeights";
import { registerFeatureCollector } from "@/lib/analysis/featureScore/featureScoreEngine";
import { createRegistryHomeAwayProvider } from "@/lib/providers/registry/createRegistryProviders";
import type {
  HomeAwayProvider,
  HomeAwaySnapshot,
} from "@/lib/analysis/featureScore/providers/homeAwayProvider";
import type {
  FeatureScore,
  FeatureScoreCategory,
  FeatureScoreContext,
} from "@/lib/analysis/featureScore/types";

export const HOME_AWAY_FEATURE_IDS = {
  homeWinRate: "home_away.home_win_rate",
  awayWinRate: "home_away.away_win_rate",
  homeAttack: "home_away.home_attack",
  awayAttack: "home_away.away_attack",
  homeDefense: "home_away.home_defense",
  awayDefense: "home_away.away_defense",
  homeCleanSheet: "home_away.home_clean_sheet",
  awayCleanSheet: "home_away.away_clean_sheet",
  homeAdvantage: "home_away.home_advantage",
} as const;

export type HomeAwayFeatureId =
  (typeof HOME_AWAY_FEATURE_IDS)[keyof typeof HOME_AWAY_FEATURE_IDS];

export interface HomeAwayFeatureMetadata {
  label: string;
  value: number | null;
  comparisonValue: number | null;
  homeLast5: string[];
  awayLast5: string[];
}

const FEATURE_DEFINITIONS: Array<{
  id: HomeAwayFeatureId;
  label: string;
  category: FeatureScoreCategory;
}> = [
  { id: HOME_AWAY_FEATURE_IDS.homeWinRate, label: "Home Win Rate", category: "moneyline" },
  { id: HOME_AWAY_FEATURE_IDS.awayWinRate, label: "Away Win Rate", category: "moneyline" },
  { id: HOME_AWAY_FEATURE_IDS.homeAttack, label: "Home Attack", category: "totalGoals" },
  { id: HOME_AWAY_FEATURE_IDS.awayAttack, label: "Away Attack", category: "totalGoals" },
  { id: HOME_AWAY_FEATURE_IDS.homeDefense, label: "Home Defense", category: "totalGoals" },
  { id: HOME_AWAY_FEATURE_IDS.awayDefense, label: "Away Defense", category: "totalGoals" },
  {
    id: HOME_AWAY_FEATURE_IDS.homeCleanSheet,
    label: "Home Clean Sheet",
    category: "totalGoals",
  },
  {
    id: HOME_AWAY_FEATURE_IDS.awayCleanSheet,
    label: "Away Clean Sheet",
    category: "totalGoals",
  },
  {
    id: HOME_AWAY_FEATURE_IDS.homeAdvantage,
    label: "Home Advantage",
    category: "moneyline",
  },
];

const NEUTRAL_WIN_RATE = 0.5;
const NEUTRAL_GOALS = 1.5;

let registered = false;
let defaultProvider: HomeAwayProvider = createRegistryHomeAwayProvider();

export function registerHomeAwayCollector(): void {
  if (registered) {
    return;
  }
  registerFeatureCollector(collectHomeAwayFeatures);
  registered = true;
}

export function resetHomeAwayCollectorRegistrationForTests(): void {
  registered = false;
}

export function isHomeAwayCollectorRegistered(): boolean {
  return registered;
}

export function resetHomeAwayProviderForTests(): void {
  defaultProvider = createRegistryHomeAwayProvider();
}

export function setHomeAwayProviderForTests(provider: HomeAwayProvider): void {
  defaultProvider = provider;
}

function resolveProvider(context: FeatureScoreContext): HomeAwayProvider {
  const injected = context.metadata?.homeAwayProvider;
  if (injected && typeof injected === "object" && "getHomeAwayStrength" in injected) {
    return injected as HomeAwayProvider;
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

function resolveConfidence(snapshot: HomeAwaySnapshot): number {
  const metrics = [
    snapshot.homeWinRate,
    snapshot.awayWinRate,
    snapshot.homeGoalsFor,
    snapshot.awayGoalsFor,
    snapshot.homeGoalsAgainst,
    snapshot.awayGoalsAgainst,
    snapshot.homeCleanSheetRate,
    snapshot.awayCleanSheetRate,
  ];
  const available = metrics.filter((value) => value !== null).length;

  if (available === 0) {
    return clampConfidence(0.2);
  }
  if (available < 5) {
    return clampConfidence(0.45);
  }
  return clampConfidence(0.78);
}

function buildMetadata(
  snapshot: HomeAwaySnapshot,
  label: string,
  value: number | null,
  comparisonValue: number | null
): HomeAwayFeatureMetadata {
  return {
    label,
    value,
    comparisonValue,
    homeLast5: [...snapshot.homeLast5],
    awayLast5: [...snapshot.awayLast5],
  };
}

function buildIncompleteFeature(
  id: HomeAwayFeatureId,
  label: string,
  category: FeatureScoreCategory,
  snapshot: HomeAwaySnapshot | null,
  reason: string
): FeatureScore {
  return {
    id,
    category,
    score: 0,
    weight: getFeatureWeight("homeAdvantage"),
    confidence: clampConfidence(0.2),
    reason,
    metadata: {
      ...buildMetadata(
        snapshot ?? {
          homeLast5: [],
          awayLast5: [],
          homeWinRate: null,
          awayWinRate: null,
          homeGoalsFor: null,
          awayGoalsFor: null,
          homeGoalsAgainst: null,
          awayGoalsAgainst: null,
          homeCleanSheetRate: null,
          awayCleanSheetRate: null,
        },
        label,
        null,
        null
      ),
    },
  };
}

function buildFeature(
  id: HomeAwayFeatureId,
  label: string,
  category: FeatureScoreCategory,
  snapshot: HomeAwaySnapshot,
  value: number | null,
  comparisonValue: number | null,
  score: number,
  reason: string
): FeatureScore {
  return {
    id,
    category,
    score: clampScore(score),
    weight: getFeatureWeight("homeAdvantage"),
    confidence: resolveConfidence(snapshot),
    reason,
    metadata: {
      ...buildMetadata(snapshot, label, value, comparisonValue),
    },
  };
}

function scoreHomeWinRateFeature(snapshot: HomeAwaySnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[0];
  if (snapshot.homeWinRate === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      snapshot,
      "Home Win Rate 缺少主隊主場勝率。"
    );
  }

  const score = (snapshot.homeWinRate - NEUTRAL_WIN_RATE) * 200;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    snapshot,
    snapshot.homeWinRate,
    NEUTRAL_WIN_RATE,
    score,
    `主隊主場勝率 ${(snapshot.homeWinRate * 100).toFixed(1)}%。`
  );
}

function scoreAwayWinRateFeature(snapshot: HomeAwaySnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[1];
  if (snapshot.awayWinRate === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      snapshot,
      "Away Win Rate 缺少客隊客場勝率。"
    );
  }

  const score = (NEUTRAL_WIN_RATE - snapshot.awayWinRate) * 200;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    snapshot,
    snapshot.awayWinRate,
    NEUTRAL_WIN_RATE,
    score,
    `客隊客場勝率 ${(snapshot.awayWinRate * 100).toFixed(1)}%（客隊客場越強，主隊得分越低）。`
  );
}

function scoreHomeAttackFeature(snapshot: HomeAwaySnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[2];
  if (snapshot.homeGoalsFor === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      snapshot,
      "Home Attack 缺少主隊主場進球資料。"
    );
  }

  const score = (snapshot.homeGoalsFor - NEUTRAL_GOALS) * 40;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    snapshot,
    snapshot.homeGoalsFor,
    NEUTRAL_GOALS,
    score,
    `主隊主場場均進球 ${snapshot.homeGoalsFor.toFixed(2)}。`
  );
}

function scoreAwayAttackFeature(snapshot: HomeAwaySnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[3];
  if (snapshot.awayGoalsFor === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      snapshot,
      "Away Attack 缺少客隊客場進球資料。"
    );
  }

  const score = (NEUTRAL_GOALS - snapshot.awayGoalsFor) * 40;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    snapshot,
    snapshot.awayGoalsFor,
    NEUTRAL_GOALS,
    score,
    `客隊客場場均進球 ${snapshot.awayGoalsFor.toFixed(2)}（客隊進攻越強，主隊得分越低）。`
  );
}

function scoreHomeDefenseFeature(snapshot: HomeAwaySnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[4];
  if (snapshot.homeGoalsAgainst === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      snapshot,
      "Home Defense 缺少主隊主場失球資料。"
    );
  }

  const score = (NEUTRAL_GOALS - snapshot.homeGoalsAgainst) * 40;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    snapshot,
    snapshot.homeGoalsAgainst,
    NEUTRAL_GOALS,
    score,
    `主隊主場場均失球 ${snapshot.homeGoalsAgainst.toFixed(2)}（較低較佳）。`
  );
}

function scoreAwayDefenseFeature(snapshot: HomeAwaySnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[5];
  if (snapshot.awayGoalsAgainst === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      snapshot,
      "Away Defense 缺少客隊客場失球資料。"
    );
  }

  const score = (snapshot.awayGoalsAgainst - NEUTRAL_GOALS) * 40;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    snapshot,
    snapshot.awayGoalsAgainst,
    NEUTRAL_GOALS,
    score,
    `客隊客場場均失球 ${snapshot.awayGoalsAgainst.toFixed(2)}（客隊失球越多，主隊進攻機會越高）。`
  );
}

function scoreHomeCleanSheetFeature(snapshot: HomeAwaySnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[6];
  if (snapshot.homeCleanSheetRate === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      snapshot,
      "Home Clean Sheet 缺少主隊零封率。"
    );
  }

  const score = (snapshot.homeCleanSheetRate - 0.25) * 100;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    snapshot,
    snapshot.homeCleanSheetRate,
    0.25,
    score,
    `主隊主場零封率 ${(snapshot.homeCleanSheetRate * 100).toFixed(1)}%。`
  );
}

function scoreAwayCleanSheetFeature(snapshot: HomeAwaySnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[7];
  if (snapshot.awayCleanSheetRate === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      snapshot,
      "Away Clean Sheet 缺少客隊零封率。"
    );
  }

  const score = (0.25 - snapshot.awayCleanSheetRate) * 100;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    snapshot,
    snapshot.awayCleanSheetRate,
    0.25,
    score,
    `客隊客場零封率 ${(snapshot.awayCleanSheetRate * 100).toFixed(1)}%（客隊防守越好，主隊越難得分）。`
  );
}

function scoreHomeAdvantageFeature(snapshot: HomeAwaySnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[8];

  if (
    snapshot.homeWinRate === null ||
    snapshot.awayWinRate === null ||
    snapshot.homeGoalsFor === null ||
    snapshot.awayGoalsFor === null
  ) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      snapshot,
      "Home Advantage 缺少主客對比資料。"
    );
  }

  const winDiff = snapshot.homeWinRate - snapshot.awayWinRate;
  const attackDiff = snapshot.homeGoalsFor - snapshot.awayGoalsFor;
  const defenseDiff =
    snapshot.awayGoalsAgainst !== null && snapshot.homeGoalsAgainst !== null
      ? snapshot.awayGoalsAgainst - snapshot.homeGoalsAgainst
      : 0;

  const composite =
    winDiff * 50 + attackDiff * 20 + defenseDiff * 20;
  const comparisonValue = winDiff;

  return buildFeature(
    def.id,
    def.label,
    def.category,
    snapshot,
    composite,
    comparisonValue,
    composite,
    `主場優勢綜合：主場勝率差 ${(winDiff * 100).toFixed(1)}%，進球差 ${attackDiff.toFixed(2)}。`
  );
}

function buildMissingTeamsFeatures(reason: string): FeatureScore[] {
  return FEATURE_DEFINITIONS.map((def) =>
    buildIncompleteFeature(def.id, def.label, def.category, null, reason)
  );
}

export function collectHomeAwayFeatures(context: FeatureScoreContext): FeatureScore[] {
  const { homeTeam, awayTeam } = resolveTeamNames(context);
  if (!homeTeam || !awayTeam) {
    return buildMissingTeamsFeatures("缺少主隊或客隊名稱，無法評估 Home / Away Strength。");
  }

  const provider = resolveProvider(context);
  const snapshot = provider.getHomeAwayStrength({ homeTeam, awayTeam });

  return [
    scoreHomeWinRateFeature(snapshot),
    scoreAwayWinRateFeature(snapshot),
    scoreHomeAttackFeature(snapshot),
    scoreAwayAttackFeature(snapshot),
    scoreHomeDefenseFeature(snapshot),
    scoreAwayDefenseFeature(snapshot),
    scoreHomeCleanSheetFeature(snapshot),
    scoreAwayCleanSheetFeature(snapshot),
    scoreHomeAdvantageFeature(snapshot),
  ];
}
