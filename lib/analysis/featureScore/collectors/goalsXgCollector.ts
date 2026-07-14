import { clampConfidence, clampScore } from "@/lib/analysis/featureScore/oddsConversion";
import { getFeatureWeight } from "@/lib/analysis/featureScore/featureWeights";
import { registerFeatureCollector } from "@/lib/analysis/featureScore/featureScoreEngine";
import { createRegistryGoalsXgProvider } from "@/lib/providers/registry/createRegistryProviders";
import {
  type GoalsXgProvider,
  type GoalsXgSnapshot,
  type TeamGoalsXgMetrics,
} from "@/lib/analysis/featureScore/providers/goalsXgProvider";
import type {
  FeatureScore,
  FeatureScoreCategory,
  FeatureScoreContext,
} from "@/lib/analysis/featureScore/types";

export const GOALS_XG_FEATURE_IDS = {
  homeScoring: "goals_xg.home_scoring",
  awayScoring: "goals_xg.away_scoring",
  homeDefensiveConcession: "goals_xg.home_defensive_concession",
  awayDefensiveConcession: "goals_xg.away_defensive_concession",
  homeXg: "goals_xg.home_xg",
  awayXg: "goals_xg.away_xg",
  homeXga: "goals_xg.home_xga",
  awayXga: "goals_xg.away_xga",
  shotVolume: "goals_xg.shot_volume",
  shotAccuracy: "goals_xg.shot_accuracy",
  conversionEfficiency: "goals_xg.conversion_efficiency",
  expectedGoalAdvantage: "goals_xg.expected_goal_advantage",
} as const;

export type GoalsXgFeatureId =
  (typeof GOALS_XG_FEATURE_IDS)[keyof typeof GOALS_XG_FEATURE_IDS];

export interface GoalsXgFeatureMetadata {
  label: string;
  homeValue: number | null;
  awayValue: number | null;
  differential: number | null;
  dataComplete: boolean;
}

const FEATURE_DEFINITIONS: Array<{
  id: GoalsXgFeatureId;
  label: string;
  category: FeatureScoreCategory;
}> = [
  { id: GOALS_XG_FEATURE_IDS.homeScoring, label: "Home Scoring", category: "totalGoals" },
  { id: GOALS_XG_FEATURE_IDS.awayScoring, label: "Away Scoring", category: "totalGoals" },
  {
    id: GOALS_XG_FEATURE_IDS.homeDefensiveConcession,
    label: "Home Defensive Concession",
    category: "totalGoals",
  },
  {
    id: GOALS_XG_FEATURE_IDS.awayDefensiveConcession,
    label: "Away Defensive Concession",
    category: "totalGoals",
  },
  { id: GOALS_XG_FEATURE_IDS.homeXg, label: "Home xG", category: "totalGoals" },
  { id: GOALS_XG_FEATURE_IDS.awayXg, label: "Away xG", category: "totalGoals" },
  { id: GOALS_XG_FEATURE_IDS.homeXga, label: "Home xGA", category: "totalGoals" },
  { id: GOALS_XG_FEATURE_IDS.awayXga, label: "Away xGA", category: "totalGoals" },
  { id: GOALS_XG_FEATURE_IDS.shotVolume, label: "Shot Volume", category: "totalGoals" },
  { id: GOALS_XG_FEATURE_IDS.shotAccuracy, label: "Shot Accuracy", category: "totalGoals" },
  {
    id: GOALS_XG_FEATURE_IDS.conversionEfficiency,
    label: "Conversion Efficiency",
    category: "totalGoals",
  },
  {
    id: GOALS_XG_FEATURE_IDS.expectedGoalAdvantage,
    label: "Expected Goal Advantage",
    category: "totalGoals",
  },
];

const NEUTRAL_GOALS = 1.5;

let registered = false;
let defaultProvider: GoalsXgProvider = createRegistryGoalsXgProvider();

export function registerGoalsXgCollector(): void {
  if (registered) {
    return;
  }
  registerFeatureCollector(collectGoalsXgFeatures);
  registered = true;
}

export function resetGoalsXgCollectorRegistrationForTests(): void {
  registered = false;
}

export function isGoalsXgCollectorRegistered(): boolean {
  return registered;
}

export function resetGoalsXgProviderForTests(): void {
  defaultProvider = createRegistryGoalsXgProvider();
}

export function setGoalsXgProviderForTests(provider: GoalsXgProvider): void {
  defaultProvider = provider;
}

function resolveProvider(context: FeatureScoreContext): GoalsXgProvider {
  const injected = context.metadata?.goalsXgProvider;
  if (injected && typeof injected === "object" && "getGoalsXgMetrics" in injected) {
    return injected as GoalsXgProvider;
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

function confidenceFromAvailability(available: number, total: number): number {
  if (available <= 0) {
    return clampConfidence(0.2);
  }
  if (available < total) {
    return clampConfidence(0.35 + (available / total) * 0.35);
  }
  return clampConfidence(0.78);
}

function buildMetadata(
  label: string,
  homeValue: number | null,
  awayValue: number | null,
  dataComplete: boolean
): GoalsXgFeatureMetadata {
  const differential =
    homeValue !== null && awayValue !== null
      ? Math.round((homeValue - awayValue) * 1000) / 1000
      : homeValue !== null && awayValue === null
        ? homeValue
        : awayValue !== null && homeValue === null
          ? awayValue === 0
            ? 0
            : -awayValue
          : null;

  return {
    label,
    homeValue,
    awayValue,
    differential,
    dataComplete,
  };
}

function buildIncompleteFeature(
  id: GoalsXgFeatureId,
  label: string,
  category: FeatureScoreCategory,
  reason: string,
  partial?: { homeValue?: number | null; awayValue?: number | null }
): FeatureScore {
  return {
    id,
    category,
    score: 0,
    weight: getFeatureWeight("goalsXg"),
    confidence: clampConfidence(0.2),
    reason,
    metadata: {
      ...buildMetadata(
        label,
        partial?.homeValue ?? null,
        partial?.awayValue ?? null,
        false
      ),
    },
  };
}

function buildFeature(
  id: GoalsXgFeatureId,
  label: string,
  category: FeatureScoreCategory,
  homeValue: number | null,
  awayValue: number | null,
  score: number,
  reason: string,
  available: number,
  total: number
): FeatureScore {
  return {
    id,
    category,
    score: clampScore(score),
    weight: getFeatureWeight("goalsXg"),
    confidence: confidenceFromAvailability(available, total),
    reason,
    metadata: {
      ...buildMetadata(label, homeValue, awayValue, available === total),
    },
  };
}

function scoreHomeScoring(snapshot: GoalsXgSnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[0];
  const homeValue = snapshot.home.averageGoalsFor;
  const awayValue = snapshot.away.averageGoalsFor;

  if (homeValue === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Home Scoring 缺少主隊場均進球資料。"
    );
  }

  const available = awayValue !== null ? 2 : 1;
  const score =
    awayValue !== null
      ? (homeValue - awayValue) * 40
      : (homeValue - NEUTRAL_GOALS) * 40;

  return buildFeature(
    def.id,
    def.label,
    def.category,
    homeValue,
    awayValue,
    score,
    awayValue !== null
      ? `主隊場均進球 ${homeValue.toFixed(2)}，客隊 ${awayValue.toFixed(2)}。`
      : `主隊場均進球 ${homeValue.toFixed(2)}（客隊進球資料缺失，僅以主隊估算）。`,
    available,
    2
  );
}

function scoreAwayScoring(snapshot: GoalsXgSnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[1];
  const homeValue = snapshot.home.averageGoalsFor;
  const awayValue = snapshot.away.averageGoalsFor;

  if (awayValue === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Away Scoring 缺少客隊場均進球資料。"
    );
  }

  const available = homeValue !== null ? 2 : 1;
  const score =
    homeValue !== null
      ? (homeValue - awayValue) * 40
      : (NEUTRAL_GOALS - awayValue) * 40;

  return buildFeature(
    def.id,
    def.label,
    def.category,
    homeValue,
    awayValue,
    score,
    `客隊場均進球 ${awayValue.toFixed(2)}（客隊進攻越強，主隊得分越低）。`,
    available,
    2
  );
}

function scoreHomeDefensiveConcession(snapshot: GoalsXgSnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[2];
  const homeValue = snapshot.home.averageGoalsAgainst;

  if (homeValue === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Home Defensive Concession 缺少主隊場均失球資料。"
    );
  }

  const score = (NEUTRAL_GOALS - homeValue) * 40;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    homeValue,
    snapshot.away.averageGoalsAgainst,
    score,
    `主隊場均失球 ${homeValue.toFixed(2)}（較低較佳）。`,
    1,
    1
  );
}

function scoreAwayDefensiveConcession(snapshot: GoalsXgSnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[3];
  const awayValue = snapshot.away.averageGoalsAgainst;

  if (awayValue === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Away Defensive Concession 缺少客隊場均失球資料。"
    );
  }

  const score = (awayValue - NEUTRAL_GOALS) * 40;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    snapshot.home.averageGoalsAgainst,
    awayValue,
    score,
    `客隊場均失球 ${awayValue.toFixed(2)}（客隊失球越多，主隊進攻機會越高）。`,
    1,
    1
  );
}

function scoreHomeXg(snapshot: GoalsXgSnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[4];
  const homeValue = snapshot.home.xG;
  const awayValue = snapshot.away.xG;

  if (homeValue === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Home xG 缺少主隊 xG 資料。"
    );
  }

  const available = awayValue !== null ? 2 : 1;
  const score =
    awayValue !== null
      ? (homeValue - awayValue) * 40
      : (homeValue - NEUTRAL_GOALS) * 40;

  return buildFeature(
    def.id,
    def.label,
    def.category,
    homeValue,
    awayValue,
    score,
    `主隊 xG ${homeValue.toFixed(2)}。`,
    available,
    2
  );
}

function scoreAwayXg(snapshot: GoalsXgSnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[5];
  const awayValue = snapshot.away.xG;

  if (awayValue === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Away xG 缺少客隊 xG 資料。"
    );
  }

  const homeValue = snapshot.home.xG;
  const available = homeValue !== null ? 2 : 1;
  const score =
    homeValue !== null
      ? (homeValue - awayValue) * 40
      : (NEUTRAL_GOALS - awayValue) * 40;

  return buildFeature(
    def.id,
    def.label,
    def.category,
    homeValue,
    awayValue,
    score,
    `客隊 xG ${awayValue.toFixed(2)}。`,
    available,
    2
  );
}

function scoreHomeXga(snapshot: GoalsXgSnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[6];
  const homeValue = snapshot.home.xGA;

  if (homeValue === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Home xGA 缺少主隊 xGA 資料。"
    );
  }

  const score = (NEUTRAL_GOALS - homeValue) * 40;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    homeValue,
    snapshot.away.xGA,
    score,
    `主隊 xGA ${homeValue.toFixed(2)}（較低較佳）。`,
    1,
    1
  );
}

function scoreAwayXga(snapshot: GoalsXgSnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[7];
  const awayValue = snapshot.away.xGA;

  if (awayValue === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Away xGA 缺少客隊 xGA 資料。"
    );
  }

  const score = (awayValue - NEUTRAL_GOALS) * 40;
  return buildFeature(
    def.id,
    def.label,
    def.category,
    snapshot.home.xGA,
    awayValue,
    score,
    `客隊 xGA ${awayValue.toFixed(2)}。`,
    1,
    1
  );
}

function scoreShotVolume(snapshot: GoalsXgSnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[8];
  const homeValue = snapshot.home.shots;
  const awayValue = snapshot.away.shots;

  if (homeValue === null && awayValue === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Shot Volume 缺少射門次數資料。"
    );
  }

  const available = (homeValue !== null ? 1 : 0) + (awayValue !== null ? 1 : 0);
  const score =
    homeValue !== null && awayValue !== null
      ? (homeValue - awayValue) * 6
      : homeValue !== null
        ? (homeValue - 11) * 6
        : (11 - (awayValue as number)) * 6;

  return buildFeature(
    def.id,
    def.label,
    def.category,
    homeValue,
    awayValue,
    score,
    homeValue !== null && awayValue !== null
      ? `主隊場均射門 ${homeValue.toFixed(1)}，客隊 ${awayValue.toFixed(1)}。`
      : "Shot Volume 僅有部分射門資料。",
    available,
    2
  );
}

function scoreShotAccuracy(snapshot: GoalsXgSnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[9];
  const homeValue = snapshot.home.shotAccuracy;
  const awayValue = snapshot.away.shotAccuracy;

  if (homeValue === null && awayValue === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Shot Accuracy 缺少射正率資料。"
    );
  }

  const available = (homeValue !== null ? 1 : 0) + (awayValue !== null ? 1 : 0);
  const score =
    homeValue !== null && awayValue !== null
      ? (homeValue - awayValue) * 120
      : homeValue !== null
        ? (homeValue - 0.35) * 120
        : (0.35 - (awayValue as number)) * 120;

  return buildFeature(
    def.id,
    def.label,
    def.category,
    homeValue,
    awayValue,
    score,
    homeValue !== null && awayValue !== null
      ? `主隊射正率 ${(homeValue * 100).toFixed(1)}%，客隊 ${(awayValue * 100).toFixed(1)}%。`
      : "Shot Accuracy 僅有部分射正率資料。",
    available,
    2
  );
}

function scoreConversionEfficiency(snapshot: GoalsXgSnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[10];
  const homeValue = snapshot.home.conversionRate;
  const awayValue = snapshot.away.conversionRate;

  if (homeValue === null && awayValue === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Conversion Efficiency 缺少轉化率資料。"
    );
  }

  const available = (homeValue !== null ? 1 : 0) + (awayValue !== null ? 1 : 0);
  const score =
    homeValue !== null && awayValue !== null
      ? (homeValue - awayValue) * 200
      : homeValue !== null
        ? (homeValue - 0.14) * 200
        : (0.14 - (awayValue as number)) * 200;

  return buildFeature(
    def.id,
    def.label,
    def.category,
    homeValue,
    awayValue,
    score,
    homeValue !== null && awayValue !== null
      ? `主隊轉化率 ${(homeValue * 100).toFixed(1)}%，客隊 ${(awayValue * 100).toFixed(1)}%。`
      : "Conversion Efficiency 僅有部分轉化率資料。",
    available,
    2
  );
}

function expectedGoalBalance(team: TeamGoalsXgMetrics): number | null {
  if (team.xG === null || team.xGA === null) {
    return null;
  }
  return Math.round((team.xG - team.xGA) * 1000) / 1000;
}

function scoreExpectedGoalAdvantage(snapshot: GoalsXgSnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[11];
  const homeBalance = expectedGoalBalance(snapshot.home);
  const awayBalance = expectedGoalBalance(snapshot.away);

  if (homeBalance === null && awayBalance === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      "Expected Goal Advantage 缺少 xG / xGA 資料。"
    );
  }

  const available =
    (homeBalance !== null ? 1 : 0) + (awayBalance !== null ? 1 : 0);
  const score =
    homeBalance !== null && awayBalance !== null
      ? (homeBalance - awayBalance) * 40
      : homeBalance !== null
        ? homeBalance * 40
        : -(awayBalance as number) * 40;

  return buildFeature(
    def.id,
    def.label,
    def.category,
    homeBalance,
    awayBalance,
    score,
    homeBalance !== null && awayBalance !== null
      ? `主隊 xG 差 ${homeBalance.toFixed(2)}，客隊 ${awayBalance.toFixed(2)}。`
      : "Expected Goal Advantage 僅有部分 xG / xGA 資料。",
    available,
    2
  );
}

function buildMissingTeamsFeatures(reason: string): FeatureScore[] {
  return FEATURE_DEFINITIONS.map((def) =>
    buildIncompleteFeature(def.id, def.label, def.category, reason)
  );
}

export function collectGoalsXgFeatures(context: FeatureScoreContext): FeatureScore[] {
  const { homeTeam, awayTeam } = resolveTeamNames(context);
  if (!homeTeam || !awayTeam) {
    return buildMissingTeamsFeatures("缺少主隊或客隊名稱，無法評估 Goals / xG。");
  }

  const provider = resolveProvider(context);
  const snapshot = provider.getGoalsXgMetrics({ homeTeam, awayTeam });

  return [
    scoreHomeScoring(snapshot),
    scoreAwayScoring(snapshot),
    scoreHomeDefensiveConcession(snapshot),
    scoreAwayDefensiveConcession(snapshot),
    scoreHomeXg(snapshot),
    scoreAwayXg(snapshot),
    scoreHomeXga(snapshot),
    scoreAwayXga(snapshot),
    scoreShotVolume(snapshot),
    scoreShotAccuracy(snapshot),
    scoreConversionEfficiency(snapshot),
    scoreExpectedGoalAdvantage(snapshot),
  ];
}
