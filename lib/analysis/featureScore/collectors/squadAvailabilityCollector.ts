import { clampConfidence, clampScore } from "@/lib/analysis/featureScore/oddsConversion";
import { getFeatureWeight } from "@/lib/analysis/featureScore/featureWeights";
import { registerFeatureCollector } from "@/lib/analysis/featureScore/featureScoreEngine";
import { createRegistrySquadAvailabilityProvider } from "@/lib/providers/registry/createRegistryProviders";
import {
  type SquadAvailabilityProvider,
  type SquadAvailabilitySnapshot,
  type TeamSquadAvailability,
} from "@/lib/analysis/featureScore/providers/squadAvailabilityProvider";
import type {
  FeatureScore,
  FeatureScoreCategory,
  FeatureScoreContext,
} from "@/lib/analysis/featureScore/types";

export const SQUAD_AVAILABILITY_FEATURE_IDS = {
  injuryImpact: "squad_availability.injury_impact",
  suspensionImpact: "squad_availability.suspension_impact",
  missingStartingXi: "squad_availability.missing_starting_xi",
  attackAvailability: "squad_availability.attack_availability",
  midfieldAvailability: "squad_availability.midfield_availability",
  defenseAvailability: "squad_availability.defense_availability",
  goalkeeperAvailability: "squad_availability.goalkeeper_availability",
  squadDepth: "squad_availability.squad_depth",
  rotationRisk: "squad_availability.rotation_risk",
  fatigueRisk: "squad_availability.fatigue_risk",
  restAdvantage: "squad_availability.rest_advantage",
} as const;

export type SquadAvailabilityFeatureId =
  (typeof SQUAD_AVAILABILITY_FEATURE_IDS)[keyof typeof SQUAD_AVAILABILITY_FEATURE_IDS];

export interface SquadAvailabilityFeatureMetadata {
  label: string;
  homeValue: number | null;
  awayValue: number | null;
  differential: number | null;
}

const STARTER_WEIGHT = 18;
const INJURY_WEIGHT = 10;
const SUSPENSION_WEIGHT = 16;
const ATTACK_WEIGHT = 22;
const MIDFIELD_WEIGHT = 16;
const DEFENDER_WEIGHT = 14;
const DEFENDER_STACK_PENALTY = 12;
const GOALKEEPER_WEIGHT = 75;
const ROTATION_CONFIDENCE_PENALTY = 0.08;

let registered = false;
let defaultProvider: SquadAvailabilityProvider =
  createRegistrySquadAvailabilityProvider();

export function registerSquadAvailabilityCollector(): void {
  if (registered) {
    return;
  }
  registerFeatureCollector(collectSquadAvailabilityFeatures);
  registered = true;
}

export function resetSquadAvailabilityCollectorRegistrationForTests(): void {
  registered = false;
}

export function isSquadAvailabilityCollectorRegistered(): boolean {
  return registered;
}

export function resetSquadAvailabilityProviderForTests(): void {
  defaultProvider = createRegistrySquadAvailabilityProvider();
}

export function setSquadAvailabilityProviderForTests(
  provider: SquadAvailabilityProvider
): void {
  defaultProvider = provider;
}

function resolveProvider(context: FeatureScoreContext): SquadAvailabilityProvider {
  const injected = context.metadata?.squadAvailabilityProvider;
  if (
    injected &&
    typeof injected === "object" &&
    "getSquadAvailability" in injected
  ) {
    return injected as SquadAvailabilityProvider;
  }
  return defaultProvider;
}

function resolveTeams(context: FeatureScoreContext): {
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

function isEmptyAvailability(team: TeamSquadAvailability): boolean {
  return Object.values(team).every((value) => value === null);
}

function rotationLevel(snapshot: SquadAvailabilitySnapshot): number {
  const values = [
    snapshot.home.expectedRotationCount,
    snapshot.away.expectedRotationCount,
  ].filter((value): value is number => value !== null);
  return values.length > 0 ? Math.max(...values) : 0;
}

function resolveConfidence(
  snapshot: SquadAvailabilitySnapshot,
  fieldsAvailable: number,
  fieldsRequired: number,
  injuryDataKnown: boolean
): number {
  const completeness =
    fieldsRequired > 0 ? fieldsAvailable / fieldsRequired : 0;
  let confidence = 0.25 + completeness * 0.55;

  if (!injuryDataKnown) {
    confidence *= 0.65;
  }

  const rotation = rotationLevel(snapshot);
  if (rotation >= 5) {
    confidence *= 1 - ROTATION_CONFIDENCE_PENALTY * (rotation - 4);
  }

  return clampConfidence(confidence);
}

function buildMetadata(
  label: string,
  homeValue: number | null,
  awayValue: number | null
): SquadAvailabilityFeatureMetadata {
  const differential =
    homeValue !== null && awayValue !== null
      ? Math.round((awayValue - homeValue) * 1000) / 1000
      : null;

  return {
    label,
    homeValue,
    awayValue,
    differential,
  };
}

function buildFeature(
  id: SquadAvailabilityFeatureId,
  label: string,
  category: FeatureScoreCategory,
  score: number,
  reason: string,
  metadata: SquadAvailabilityFeatureMetadata,
  confidence: number
): FeatureScore {
  return {
    id,
    category,
    score: clampScore(score),
    weight: getFeatureWeight("squadAvailability"),
    confidence: clampConfidence(confidence),
    reason,
    metadata: { ...metadata },
  };
}

function starterInjuryPenalty(team: TeamSquadAvailability): number | null {
  if (team.injuries === null && team.missingStartingXI === null) {
    return null;
  }

  const injuries = team.injuries ?? 0;
  const starters = team.missingStartingXI ?? 0;
  return injuries * INJURY_WEIGHT * 0.4 + starters * STARTER_WEIGHT;
}

function scoreInjuryImpact(
  snapshot: SquadAvailabilitySnapshot
): FeatureScore | null {
  const homePenalty = starterInjuryPenalty(snapshot.home);
  const awayPenalty = starterInjuryPenalty(snapshot.away);

  if (homePenalty === null && awayPenalty === null) {
    return null;
  }

  const home = homePenalty ?? 0;
  const away = awayPenalty ?? 0;
  const injuryKnown =
    snapshot.home.injuries !== null && snapshot.away.injuries !== null;

  return buildFeature(
    SQUAD_AVAILABILITY_FEATURE_IDS.injuryImpact,
    "Injury Impact",
    "moneyline",
    away - home,
    `傷兵影響：主隊折損 ${home.toFixed(1)}，客隊 ${away.toFixed(1)}（主力缺陣權重較高）。`,
    buildMetadata(
      "Injury Impact",
      snapshot.home.injuries,
      snapshot.away.injuries
    ),
    resolveConfidence(snapshot, injuryKnown ? 2 : 1, 2, injuryKnown)
  );
}

function scoreSuspensionImpact(
  snapshot: SquadAvailabilitySnapshot
): FeatureScore | null {
  if (snapshot.home.suspensions === null || snapshot.away.suspensions === null) {
    return null;
  }

  const homeImpact = snapshot.home.suspensions * SUSPENSION_WEIGHT;
  const awayImpact = snapshot.away.suspensions * SUSPENSION_WEIGHT;

  return buildFeature(
    SQUAD_AVAILABILITY_FEATURE_IDS.suspensionImpact,
    "Suspension Impact",
    "moneyline",
    awayImpact - homeImpact,
    `停賽影響：主隊 ${snapshot.home.suspensions} 人，客隊 ${snapshot.away.suspensions} 人。`,
    buildMetadata(
      "Suspension Impact",
      snapshot.home.suspensions,
      snapshot.away.suspensions
    ),
    resolveConfidence(snapshot, 2, 2, true)
  );
}

function scoreMissingStartingXi(
  snapshot: SquadAvailabilitySnapshot
): FeatureScore | null {
  if (
    snapshot.home.missingStartingXI === null ||
    snapshot.away.missingStartingXI === null
  ) {
    return null;
  }

  const homeImpact = snapshot.home.missingStartingXI * STARTER_WEIGHT;
  const awayImpact = snapshot.away.missingStartingXI * STARTER_WEIGHT;

  return buildFeature(
    SQUAD_AVAILABILITY_FEATURE_IDS.missingStartingXi,
    "Missing Starting XI",
    "moneyline",
    awayImpact - homeImpact,
    `Missing Starting XI：主隊 ${snapshot.home.missingStartingXI} 人，客隊 ${snapshot.away.missingStartingXI} 人。`,
    buildMetadata(
      "Missing Starting XI",
      snapshot.home.missingStartingXI,
      snapshot.away.missingStartingXI
    ),
    resolveConfidence(snapshot, 2, 2, true)
  );
}

function scoreLineAvailability(
  id: SquadAvailabilityFeatureId,
  label: string,
  homeMissing: number | null,
  awayMissing: number | null,
  weight: number,
  snapshot: SquadAvailabilitySnapshot,
  reasonLabel: string
): FeatureScore | null {
  if (homeMissing === null || awayMissing === null) {
    return null;
  }

  const homeImpact = homeMissing * weight;
  const awayImpact = awayMissing * weight;

  return buildFeature(
    id,
    label,
    "moneyline",
    awayImpact - homeImpact,
    `${reasonLabel}：主隊缺 ${homeMissing} 人，客隊缺 ${awayMissing} 人。`,
    buildMetadata(label, homeMissing, awayMissing),
    resolveConfidence(snapshot, 2, 2, true)
  );
}

function scoreDefenseAvailability(
  snapshot: SquadAvailabilitySnapshot
): FeatureScore | null {
  const homeMissing = snapshot.home.missingDefenders;
  const awayMissing = snapshot.away.missingDefenders;

  if (homeMissing === null || awayMissing === null) {
    return null;
  }

  let homeImpact = homeMissing * DEFENDER_WEIGHT;
  let awayImpact = awayMissing * DEFENDER_WEIGHT;

  if (homeMissing >= 2) {
    homeImpact += DEFENDER_STACK_PENALTY * (homeMissing - 1);
  }
  if (awayMissing >= 2) {
    awayImpact += DEFENDER_STACK_PENALTY * (awayMissing - 1);
  }

  return buildFeature(
    SQUAD_AVAILABILITY_FEATURE_IDS.defenseAvailability,
    "Defense Availability",
    "moneyline",
    awayImpact - homeImpact,
    `Defense Availability：主隊缺後衛 ${homeMissing} 人，客隊 ${awayMissing} 人（多名後衛可累積影響）。`,
    buildMetadata("Defense Availability", homeMissing, awayMissing),
    resolveConfidence(snapshot, 2, 2, true)
  );
}

function scoreGoalkeeperAvailability(
  snapshot: SquadAvailabilitySnapshot
): FeatureScore | null {
  if (
    snapshot.home.missingGoalkeeper === null ||
    snapshot.away.missingGoalkeeper === null
  ) {
    return null;
  }

  const homeImpact = snapshot.home.missingGoalkeeper * GOALKEEPER_WEIGHT;
  const awayImpact = snapshot.away.missingGoalkeeper * GOALKEEPER_WEIGHT;

  return buildFeature(
    SQUAD_AVAILABILITY_FEATURE_IDS.goalkeeperAvailability,
    "Goalkeeper Availability",
    "moneyline",
    awayImpact - homeImpact,
    `Goalkeeper Availability：主隊缺守門員 ${snapshot.home.missingGoalkeeper}，客隊 ${snapshot.away.missingGoalkeeper}（守門員權重最高）。`,
    buildMetadata(
      "Goalkeeper Availability",
      snapshot.home.missingGoalkeeper,
      snapshot.away.missingGoalkeeper
    ),
    resolveConfidence(snapshot, 2, 2, true)
  );
}

function scoreSquadDepth(snapshot: SquadAvailabilitySnapshot): FeatureScore | null {
  if (
    snapshot.home.squadDepthScore === null ||
    snapshot.away.squadDepthScore === null
  ) {
    return null;
  }

  const diff =
    (snapshot.home.squadDepthScore - snapshot.away.squadDepthScore) * 100;

  return buildFeature(
    SQUAD_AVAILABILITY_FEATURE_IDS.squadDepth,
    "Squad Depth",
    "moneyline",
    diff,
    `Squad Depth：主隊 ${snapshot.home.squadDepthScore.toFixed(2)}，客隊 ${snapshot.away.squadDepthScore.toFixed(2)}。`,
    buildMetadata(
      "Squad Depth",
      snapshot.home.squadDepthScore,
      snapshot.away.squadDepthScore
    ),
    resolveConfidence(snapshot, 2, 2, true)
  );
}

function scoreRotationRisk(snapshot: SquadAvailabilitySnapshot): FeatureScore | null {
  if (
    snapshot.home.expectedRotationCount === null ||
    snapshot.away.expectedRotationCount === null
  ) {
    return null;
  }

  const diff =
    snapshot.away.expectedRotationCount - snapshot.home.expectedRotationCount;
  const score = diff * 8;

  let confidence = resolveConfidence(snapshot, 2, 2, true);
  const maxRotation = rotationLevel(snapshot);
  if (maxRotation >= 4) {
    confidence = clampConfidence(confidence * 0.75);
  }

  return buildFeature(
    SQUAD_AVAILABILITY_FEATURE_IDS.rotationRisk,
    "Rotation Risk",
    "moneyline",
    score,
    `Rotation Risk：主隊預期輪換 ${snapshot.home.expectedRotationCount} 人，客隊 ${snapshot.away.expectedRotationCount} 人（輪換預期越高，confidence 越低）。`,
    buildMetadata(
      "Rotation Risk",
      snapshot.home.expectedRotationCount,
      snapshot.away.expectedRotationCount
    ),
    confidence
  );
}

function fatigueLoad(daysSinceLastMatch: number | null): number | null {
  if (daysSinceLastMatch === null) {
    return null;
  }
  return Math.max(0, 5 - daysSinceLastMatch) * 12;
}

function scoreFatigueRisk(snapshot: SquadAvailabilitySnapshot): FeatureScore | null {
  const homeFatigue = fatigueLoad(snapshot.home.daysSinceLastMatch);
  const awayFatigue = fatigueLoad(snapshot.away.daysSinceLastMatch);

  if (homeFatigue === null || awayFatigue === null) {
    return null;
  }

  return buildFeature(
    SQUAD_AVAILABILITY_FEATURE_IDS.fatigueRisk,
    "Fatigue Risk",
    "moneyline",
    awayFatigue - homeFatigue,
    `Fatigue Risk：主隊距上場 ${snapshot.home.daysSinceLastMatch} 天，客隊 ${snapshot.away.daysSinceLastMatch} 天（賽程越密集，疲勞風險越高）。`,
    buildMetadata(
      "Fatigue Risk",
      snapshot.home.daysSinceLastMatch,
      snapshot.away.daysSinceLastMatch
    ),
    resolveConfidence(snapshot, 2, 2, true)
  );
}

function scoreRestAdvantage(snapshot: SquadAvailabilitySnapshot): FeatureScore | null {
  if (
    snapshot.home.daysSinceLastMatch === null ||
    snapshot.away.daysSinceLastMatch === null
  ) {
    return null;
  }

  const diff =
    snapshot.home.daysSinceLastMatch - snapshot.away.daysSinceLastMatch;
  const score = diff * 6;

  return buildFeature(
    SQUAD_AVAILABILITY_FEATURE_IDS.restAdvantage,
    "Rest Advantage",
    "moneyline",
    score,
    `Rest Advantage：主隊休息 ${snapshot.home.daysSinceLastMatch} 天，客隊 ${snapshot.away.daysSinceLastMatch} 天。`,
    buildMetadata(
      "Rest Advantage",
      snapshot.home.daysSinceLastMatch,
      snapshot.away.daysSinceLastMatch
    ),
    resolveConfidence(snapshot, 2, 2, true)
  );
}

function compact(features: Array<FeatureScore | null>): FeatureScore[] {
  return features.filter((feature): feature is FeatureScore => feature !== null);
}

export function collectSquadAvailabilityFeatures(
  context: FeatureScoreContext
): FeatureScore[] {
  const { homeTeam, awayTeam } = resolveTeams(context);
  if (!homeTeam || !awayTeam) {
    return [];
  }

  const provider = resolveProvider(context);
  const snapshot = provider.getSquadAvailability({ homeTeam, awayTeam });

  if (isEmptyAvailability(snapshot.home) && isEmptyAvailability(snapshot.away)) {
    return [];
  }

  return compact([
    scoreInjuryImpact(snapshot),
    scoreSuspensionImpact(snapshot),
    scoreMissingStartingXi(snapshot),
    scoreLineAvailability(
      SQUAD_AVAILABILITY_FEATURE_IDS.attackAvailability,
      "Attack Availability",
      snapshot.home.missingAttackers,
      snapshot.away.missingAttackers,
      ATTACK_WEIGHT,
      snapshot,
      "Attack Availability"
    ),
    scoreLineAvailability(
      SQUAD_AVAILABILITY_FEATURE_IDS.midfieldAvailability,
      "Midfield Availability",
      snapshot.home.missingMidfielders,
      snapshot.away.missingMidfielders,
      MIDFIELD_WEIGHT,
      snapshot,
      "Midfield Availability"
    ),
    scoreDefenseAvailability(snapshot),
    scoreGoalkeeperAvailability(snapshot),
    scoreSquadDepth(snapshot),
    scoreRotationRisk(snapshot),
    scoreFatigueRisk(snapshot),
    scoreRestAdvantage(snapshot),
  ]);
}
