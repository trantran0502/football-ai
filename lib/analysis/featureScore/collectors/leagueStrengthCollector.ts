import { clampConfidence, clampScore } from "@/lib/analysis/featureScore/oddsConversion";
import { getFeatureWeight } from "@/lib/analysis/featureScore/featureWeights";
import { registerFeatureCollector } from "@/lib/analysis/featureScore/featureScoreEngine";
import { createRegistryLeagueStrengthProvider } from "@/lib/providers/registry/createRegistryProviders";
import type {
  LeagueStrengthProvider,
  LeagueStrengthSnapshot,
} from "@/lib/analysis/featureScore/providers/leagueStrengthProvider";
import type {
  FeatureScore,
  FeatureScoreCategory,
  FeatureScoreContext,
} from "@/lib/analysis/featureScore/types";

export const LEAGUE_STRENGTH_FEATURE_IDS = {
  leagueRank: "league_strength.league_rank",
  leagueTier: "league_strength.league_tier",
  attackStrength: "league_strength.attack_strength",
  defenseStrength: "league_strength.defense_strength",
  goalEnvironment: "league_strength.goal_environment",
} as const;

export type LeagueStrengthFeatureId =
  (typeof LEAGUE_STRENGTH_FEATURE_IDS)[keyof typeof LEAGUE_STRENGTH_FEATURE_IDS];

export interface LeagueStrengthFeatureMetadata {
  label: string;
  leagueName: string;
  value: number | null;
  rawMetric: number | null;
}

const FEATURE_DEFINITIONS: Array<{
  id: LeagueStrengthFeatureId;
  label: string;
  category: FeatureScoreCategory;
}> = [
  {
    id: LEAGUE_STRENGTH_FEATURE_IDS.leagueRank,
    label: "League Rank",
    category: "moneyline",
  },
  {
    id: LEAGUE_STRENGTH_FEATURE_IDS.leagueTier,
    label: "League Tier",
    category: "moneyline",
  },
  {
    id: LEAGUE_STRENGTH_FEATURE_IDS.attackStrength,
    label: "Attack Strength",
    category: "totalGoals",
  },
  {
    id: LEAGUE_STRENGTH_FEATURE_IDS.defenseStrength,
    label: "Defense Strength",
    category: "totalGoals",
  },
  {
    id: LEAGUE_STRENGTH_FEATURE_IDS.goalEnvironment,
    label: "Goal Environment",
    category: "totalGoals",
  },
];

const MAX_LEAGUE_RANK = 100;
const NEUTRAL_GOAL_LINE = 2.5;

let registered = false;
let defaultProvider: LeagueStrengthProvider = createRegistryLeagueStrengthProvider();

export function registerLeagueStrengthCollector(): void {
  if (registered) {
    return;
  }
  registerFeatureCollector(collectLeagueStrengthFeatures);
  registered = true;
}

export function resetLeagueStrengthCollectorRegistrationForTests(): void {
  registered = false;
}

export function isLeagueStrengthCollectorRegistered(): boolean {
  return registered;
}

export function resetLeagueStrengthProviderForTests(): void {
  defaultProvider = createRegistryLeagueStrengthProvider();
}

export function setLeagueStrengthProviderForTests(
  provider: LeagueStrengthProvider
): void {
  defaultProvider = provider;
}

function resolveProvider(context: FeatureScoreContext): LeagueStrengthProvider {
  const injected = context.metadata?.leagueStrengthProvider;
  if (injected && typeof injected === "object" && "getLeagueStrength" in injected) {
    return injected as LeagueStrengthProvider;
  }
  return defaultProvider;
}

function resolveLeagueName(context: FeatureScoreContext): string | null {
  const league =
    context.metadata?.leagueName ?? context.metadata?.league ?? context.metadata?.leagueId;

  return typeof league === "string" && league.trim() ? league.trim() : null;
}

function resolveConfidence(snapshot: LeagueStrengthSnapshot): number {
  const metrics = [
    snapshot.leagueRanking,
    snapshot.leagueTier,
    snapshot.attackStrength,
    snapshot.defenseStrength,
    snapshot.averageGoals,
    snapshot.averageGoalsConceded,
  ];
  const available = metrics.filter((value) => value !== null).length;

  if (available === 0) {
    return clampConfidence(0.2);
  }
  if (available < 4) {
    return clampConfidence(0.45);
  }
  return clampConfidence(0.8);
}

function buildIncompleteFeature(
  id: LeagueStrengthFeatureId,
  label: string,
  category: FeatureScoreCategory,
  leagueName: string,
  reason: string
): FeatureScore {
  return {
    id,
    category,
    score: 0,
    weight: getFeatureWeight("leagueStrength"),
    confidence: clampConfidence(0.2),
    reason,
    metadata: {
      label,
      leagueName,
      value: null,
      rawMetric: null,
    } satisfies LeagueStrengthFeatureMetadata as Record<string, unknown>,
  };
}

function buildFeature(
  id: LeagueStrengthFeatureId,
  label: string,
  category: FeatureScoreCategory,
  snapshot: LeagueStrengthSnapshot,
  value: number | null,
  rawMetric: number | null,
  score: number,
  reason: string
): FeatureScore {
  return {
    id,
    category,
    score: clampScore(score),
    weight: getFeatureWeight("leagueStrength"),
    confidence: resolveConfidence(snapshot),
    reason,
    metadata: {
      label,
      leagueName: snapshot.leagueName,
      value,
      rawMetric,
    } satisfies LeagueStrengthFeatureMetadata as Record<string, unknown>,
  };
}

function scoreLeagueRankFeature(snapshot: LeagueStrengthSnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[0];
  if (snapshot.leagueRanking === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      snapshot.leagueName,
      "League Rank 缺少聯賽排名資料。"
    );
  }

  const normalized =
    (MAX_LEAGUE_RANK - snapshot.leagueRanking + 1) / MAX_LEAGUE_RANK;
  const score = normalized * 100;

  return buildFeature(
    def.id,
    def.label,
    def.category,
    snapshot,
    snapshot.leagueRanking,
    snapshot.leagueRanking,
    score,
    `${snapshot.leagueName} 全球排名 #${snapshot.leagueRanking}，競爭強度較高。`
  );
}

function scoreLeagueTierFeature(snapshot: LeagueStrengthSnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[1];
  if (snapshot.leagueTier === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      snapshot.leagueName,
      "League Tier 缺少聯賽級別資料。"
    );
  }

  const score = ((5 - snapshot.leagueTier) / 4) * 100;

  return buildFeature(
    def.id,
    def.label,
    def.category,
    snapshot,
    snapshot.leagueTier,
    snapshot.leagueTier,
    score,
    `${snapshot.leagueName} 為 Tier ${snapshot.leagueTier} 聯賽。`
  );
}

function scoreAttackStrengthFeature(snapshot: LeagueStrengthSnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[2];
  if (snapshot.attackStrength === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      snapshot.leagueName,
      "Attack Strength 缺少聯賽進攻強度資料。"
    );
  }

  const score = snapshot.attackStrength * 100;

  return buildFeature(
    def.id,
    def.label,
    def.category,
    snapshot,
    snapshot.attackStrength,
    snapshot.attackStrength,
    score,
    `${snapshot.leagueName} 進攻強度指數 ${snapshot.attackStrength.toFixed(2)}。`
  );
}

function scoreDefenseStrengthFeature(snapshot: LeagueStrengthSnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[3];
  if (snapshot.defenseStrength === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      snapshot.leagueName,
      "Defense Strength 缺少聯賽防守強度資料。"
    );
  }

  const score = snapshot.defenseStrength * 100;

  return buildFeature(
    def.id,
    def.label,
    def.category,
    snapshot,
    snapshot.defenseStrength,
    snapshot.defenseStrength,
    score,
    `${snapshot.leagueName} 防守強度指數 ${snapshot.defenseStrength.toFixed(2)}。`
  );
}

function scoreGoalEnvironmentFeature(snapshot: LeagueStrengthSnapshot): FeatureScore {
  const def = FEATURE_DEFINITIONS[4];
  if (snapshot.averageGoals === null || snapshot.averageGoalsConceded === null) {
    return buildIncompleteFeature(
      def.id,
      def.label,
      def.category,
      snapshot.leagueName,
      "Goal Environment 缺少聯賽場均進失球資料。"
    );
  }

  const combinedAverage =
    (snapshot.averageGoals + snapshot.averageGoalsConceded) / 2;
  const score = (combinedAverage - NEUTRAL_GOAL_LINE) * 40;

  return buildFeature(
    def.id,
    def.label,
    def.category,
    snapshot,
    combinedAverage,
    combinedAverage,
    score,
    `${snapshot.leagueName} 場均進球 ${snapshot.averageGoals.toFixed(2)}、失球 ${snapshot.averageGoalsConceded.toFixed(2)}，整體進球環境 ${combinedAverage.toFixed(2)}。`
  );
}

function buildMissingLeagueFeatures(reason: string): FeatureScore[] {
  return FEATURE_DEFINITIONS.map((def) =>
    buildIncompleteFeature(def.id, def.label, def.category, "", reason)
  );
}

export function collectLeagueStrengthFeatures(
  context: FeatureScoreContext
): FeatureScore[] {
  const leagueName = resolveLeagueName(context);
  if (!leagueName) {
    return buildMissingLeagueFeatures("缺少聯賽名稱，無法評估 League Strength。");
  }

  const provider = resolveProvider(context);
  const snapshot = provider.getLeagueStrength({ leagueName });

  return [
    scoreLeagueRankFeature(snapshot),
    scoreLeagueTierFeature(snapshot),
    scoreAttackStrengthFeature(snapshot),
    scoreDefenseStrengthFeature(snapshot),
    scoreGoalEnvironmentFeature(snapshot),
  ];
}
