import { clampConfidence, clampScore } from "@/lib/analysis/featureScore/oddsConversion";
import { getFeatureWeight } from "@/lib/analysis/featureScore/featureWeights";
import { registerFeatureCollector } from "@/lib/analysis/featureScore/featureScoreEngine";
import { createRegistryMatchContextProvider } from "@/lib/providers/registry/createRegistryProviders";
import type {
  MatchContextProvider,
  MatchContextSnapshot,
} from "@/lib/analysis/featureScore/providers/matchContextProvider";
import type {
  FeatureScore,
  FeatureScoreCategory,
  FeatureScoreContext,
} from "@/lib/analysis/featureScore/types";

export const MATCH_CONTEXT_FEATURE_IDS = {
  fixtureCongestion: "match_context.fixture_congestion",
  restAdvantage: "match_context.rest_advantage",
  travelFatigue: "match_context.travel_fatigue",
  timezoneImpact: "match_context.timezone_impact",
  neutralVenue: "match_context.neutral_venue",
  weatherImpact: "match_context.weather_impact",
  heatImpact: "match_context.heat_impact",
  altitudeImpact: "match_context.altitude_impact",
  matchImportance: "match_context.match_importance",
  mustWinPressure: "match_context.must_win_pressure",
  qualificationMotivation: "match_context.qualification_motivation",
  derbyMotivation: "match_context.derby_motivation",
  competitionContext: "match_context.competition_context",
} as const;

export type MatchContextFeatureId =
  (typeof MATCH_CONTEXT_FEATURE_IDS)[keyof typeof MATCH_CONTEXT_FEATURE_IDS];

export interface MatchContextFeatureMetadata {
  label: string;
  homeValue: number | string | boolean | null;
  awayValue: number | string | boolean | null;
  contextValue: number | string | boolean | null;
}

const AUXILIARY_MAX_CONFIDENCE = 0.45;
const PRIMARY_MAX_CONFIDENCE = 0.72;

let registered = false;
let defaultProvider: MatchContextProvider = createRegistryMatchContextProvider();

export function registerMatchContextCollector(): void {
  if (registered) {
    return;
  }
  registerFeatureCollector(collectMatchContextFeatures);
  registered = true;
}

export function resetMatchContextCollectorRegistrationForTests(): void {
  registered = false;
}

export function isMatchContextCollectorRegistered(): boolean {
  return registered;
}

export function resetMatchContextProviderForTests(): void {
  defaultProvider = createRegistryMatchContextProvider();
}

export function setMatchContextProviderForTests(provider: MatchContextProvider): void {
  defaultProvider = provider;
}

function resolveProvider(context: FeatureScoreContext): MatchContextProvider {
  const injected = context.metadata?.matchContextProvider;
  if (injected && typeof injected === "object" && "getMatchContext" in injected) {
    return injected as MatchContextProvider;
  }
  return defaultProvider;
}

function resolveTeams(context: FeatureScoreContext): {
  homeTeam: string | null;
  awayTeam: string | null;
  matchDate: string | undefined;
} {
  const homeTeam = context.metadata?.homeTeam;
  const awayTeam = context.metadata?.awayTeam;
  const matchDate = context.metadata?.matchDate;

  return {
    homeTeam: typeof homeTeam === "string" && homeTeam.trim() ? homeTeam.trim() : null,
    awayTeam: typeof awayTeam === "string" && awayTeam.trim() ? awayTeam.trim() : null,
    matchDate: typeof matchDate === "string" && matchDate.trim() ? matchDate.trim() : undefined,
  };
}

function isEmptySnapshot(snapshot: MatchContextSnapshot): boolean {
  const homeEmpty = Object.values(snapshot.home).every((value) => value === null);
  const awayEmpty = Object.values(snapshot.away).every((value) => value === null);
  const sharedEmpty =
    snapshot.isNeutralVenue === null &&
    snapshot.weatherCondition === null &&
    snapshot.temperature === null &&
    snapshot.humidity === null &&
    snapshot.altitude === null &&
    snapshot.competitionStage === null &&
    snapshot.mustWin === null &&
    snapshot.alreadyQualified === null &&
    snapshot.alreadyEliminated === null &&
    snapshot.derbyMatch === null &&
    snapshot.cupMatch === null &&
    snapshot.leagueMatch === null &&
    snapshot.internationalBreak === null;

  return homeEmpty && awayEmpty && sharedEmpty;
}

function primaryConfidence(complete: boolean): number {
  return clampConfidence(complete ? PRIMARY_MAX_CONFIDENCE : PRIMARY_MAX_CONFIDENCE * 0.6);
}

function auxiliaryConfidence(present: boolean): number {
  return clampConfidence(present ? AUXILIARY_MAX_CONFIDENCE : 0.25);
}

function buildMetadata(
  label: string,
  homeValue: number | string | boolean | null = null,
  awayValue: number | string | boolean | null = null,
  contextValue: number | string | boolean | null = null
): MatchContextFeatureMetadata {
  return { label, homeValue, awayValue, contextValue };
}

function buildFeature(
  id: MatchContextFeatureId,
  label: string,
  category: FeatureScoreCategory,
  score: number,
  reason: string,
  metadata: MatchContextFeatureMetadata,
  confidence: number
): FeatureScore {
  return {
    id,
    category,
    score: clampScore(score),
    weight: getFeatureWeight("matchContext"),
    confidence: clampConfidence(confidence),
    reason,
    metadata: { ...metadata },
  };
}

function scoreFixtureCongestion(snapshot: MatchContextSnapshot): FeatureScore | null {
  if (
    snapshot.home.matchesLast14Days === null ||
    snapshot.away.matchesLast14Days === null
  ) {
    return null;
  }

  const homeLoad = snapshot.home.matchesLast14Days;
  const awayLoad = snapshot.away.matchesLast14Days;
  const score = (awayLoad - homeLoad) * 12 - (homeLoad - 3) * 4;

  return buildFeature(
    MATCH_CONTEXT_FEATURE_IDS.fixtureCongestion,
    "Fixture Congestion",
    "moneyline",
    score,
    `Fixture Congestion：主隊近 14 天 ${homeLoad} 場，客隊 ${awayLoad} 場（密集賽程降低評分）。`,
    buildMetadata("Fixture Congestion", homeLoad, awayLoad, null),
    primaryConfidence(true)
  );
}

function scoreRestAdvantage(snapshot: MatchContextSnapshot): FeatureScore | null {
  if (
    snapshot.home.daysSinceLastMatch === null ||
    snapshot.away.daysSinceLastMatch === null
  ) {
    return null;
  }

  const diff =
    snapshot.home.daysSinceLastMatch - snapshot.away.daysSinceLastMatch;
  const score = diff * 7;

  return buildFeature(
    MATCH_CONTEXT_FEATURE_IDS.restAdvantage,
    "Rest Advantage",
    "moneyline",
    score,
    `Rest Advantage：主隊休息 ${snapshot.home.daysSinceLastMatch} 天，客隊 ${snapshot.away.daysSinceLastMatch} 天。`,
    buildMetadata(
      "Rest Advantage",
      snapshot.home.daysSinceLastMatch,
      snapshot.away.daysSinceLastMatch,
      diff
    ),
    primaryConfidence(true)
  );
}

function scoreTravelFatigue(snapshot: MatchContextSnapshot): FeatureScore | null {
  if (
    snapshot.away.travelDistanceKm === null ||
    snapshot.away.travelTimeHours === null
  ) {
    return null;
  }

  const distanceScore = Math.min(snapshot.away.travelDistanceKm / 80, 45);
  const timeScore = Math.min(snapshot.away.travelTimeHours * 2.5, 25);
  const score = distanceScore + timeScore;

  return buildFeature(
    MATCH_CONTEXT_FEATURE_IDS.travelFatigue,
    "Travel Fatigue",
    "moneyline",
    score,
    `Travel Fatigue：客隊旅行 ${snapshot.away.travelDistanceKm} km / ${snapshot.away.travelTimeHours} 小時（長途旅行降低客隊評分）。`,
    buildMetadata(
      "Travel Fatigue",
      snapshot.home.travelDistanceKm,
      snapshot.away.travelDistanceKm,
      snapshot.away.travelTimeHours
    ),
    primaryConfidence(true)
  );
}

function scoreTimezoneImpact(snapshot: MatchContextSnapshot): FeatureScore | null {
  if (snapshot.away.timezoneDifference === null) {
    return null;
  }

  const score = snapshot.away.timezoneDifference * 6;

  return buildFeature(
    MATCH_CONTEXT_FEATURE_IDS.timezoneImpact,
    "Timezone Impact",
    "moneyline",
    score,
    `Timezone Impact：客隊時區差 ${snapshot.away.timezoneDifference} 小時。`,
    buildMetadata(
      "Timezone Impact",
      snapshot.home.timezoneDifference,
      snapshot.away.timezoneDifference,
      null
    ),
    primaryConfidence(snapshot.home.timezoneDifference !== null)
  );
}

function scoreNeutralVenue(snapshot: MatchContextSnapshot): FeatureScore | null {
  if (snapshot.isNeutralVenue === null) {
    return null;
  }

  const score = snapshot.isNeutralVenue ? -22 : 8;

  return buildFeature(
    MATCH_CONTEXT_FEATURE_IDS.neutralVenue,
    "Neutral Venue",
    "moneyline",
    score,
    snapshot.isNeutralVenue
      ? "Neutral Venue：中立場比賽，主場優勢被取消。"
      : "Neutral Venue：非中立場，保留一般主場情境。",
    buildMetadata("Neutral Venue", null, null, snapshot.isNeutralVenue),
    primaryConfidence(true)
  );
}

function scoreWeatherImpact(snapshot: MatchContextSnapshot): FeatureScore | null {
  if (snapshot.weatherCondition === null) {
    return null;
  }

  const severe =
    snapshot.weatherCondition.includes("rain") ||
    snapshot.weatherCondition.includes("storm") ||
    snapshot.weatherCondition.includes("snow");
  const score = severe ? -8 : 0;

  return buildFeature(
    MATCH_CONTEXT_FEATURE_IDS.weatherImpact,
    "Weather Impact",
    "totalGoals",
    score,
    `Weather Impact：${snapshot.weatherCondition}（輔助因子，不主導總分）。`,
    buildMetadata("Weather Impact", null, null, snapshot.weatherCondition),
    auxiliaryConfidence(true)
  );
}

function scoreHeatImpact(snapshot: MatchContextSnapshot): FeatureScore | null {
  if (snapshot.temperature === null || snapshot.humidity === null) {
    return null;
  }

  const heatIndex = Math.max(0, snapshot.temperature - 28) + Math.max(0, snapshot.humidity - 65) * 0.15;
  const score = clampScore(-heatIndex * 1.2);

  return buildFeature(
    MATCH_CONTEXT_FEATURE_IDS.heatImpact,
    "Heat Impact",
    "totalGoals",
    score,
    `Heat Impact：${snapshot.temperature}°C / 濕度 ${snapshot.humidity}%（輔助因子）。`,
    buildMetadata(
      "Heat Impact",
      snapshot.temperature,
      snapshot.humidity,
      heatIndex
    ),
    auxiliaryConfidence(true)
  );
}

function scoreAltitudeImpact(snapshot: MatchContextSnapshot): FeatureScore | null {
  if (snapshot.altitude === null) {
    return null;
  }

  const excess = Math.max(0, snapshot.altitude - 800);
  const score = clampScore(excess / 60);

  return buildFeature(
    MATCH_CONTEXT_FEATURE_IDS.altitudeImpact,
    "Altitude Impact",
    "moneyline",
    score,
    `Altitude Impact：海拔 ${snapshot.altitude} m（高海拔為輔助因子，偏向熟悉主場）。`,
    buildMetadata("Altitude Impact", null, null, snapshot.altitude),
    auxiliaryConfidence(true)
  );
}

function scoreMatchImportance(snapshot: MatchContextSnapshot): FeatureScore | null {
  if (snapshot.competitionStage === null) {
    return null;
  }

  let score = 0;
  if (snapshot.competitionStage.includes("knockout")) {
    score = 18;
  } else if (snapshot.competitionStage.includes("final")) {
    score = 25;
  } else if (snapshot.competitionStage.includes("regular")) {
    score = 6;
  }

  if (snapshot.derbyMatch) {
    score += 8;
  }

  return buildFeature(
    MATCH_CONTEXT_FEATURE_IDS.matchImportance,
    "Match Importance",
    "moneyline",
    score,
    `Match Importance：${snapshot.competitionStage}。`,
    buildMetadata("Match Importance", null, null, snapshot.competitionStage),
    primaryConfidence(true)
  );
}

function motivationFlag(value: boolean | null): number {
  if (value === null) {
    return 0;
  }
  return value ? 1 : 0;
}

function scoreMustWinPressure(snapshot: MatchContextSnapshot): FeatureScore | null {
  const homeMust = snapshot.home.mustWin ?? snapshot.mustWin;
  const awayMust = snapshot.away.mustWin ?? snapshot.mustWin;

  if (homeMust === null && awayMust === null) {
    return null;
  }

  const homePressure = motivationFlag(homeMust);
  const awayPressure = motivationFlag(awayMust);
  const score = (homePressure - awayPressure) * 28 + (homePressure + awayPressure) * 6;

  return buildFeature(
    MATCH_CONTEXT_FEATURE_IDS.mustWinPressure,
    "Must Win Pressure",
    "moneyline",
    score,
    `Must Win Pressure：主隊 ${homeMust ? "must-win" : "normal"}，客隊 ${awayMust ? "must-win" : "normal"}。`,
    buildMetadata("Must Win Pressure", homeMust, awayMust, snapshot.mustWin),
    primaryConfidence(homeMust !== null && awayMust !== null)
  );
}

function scoreQualificationMotivation(
  snapshot: MatchContextSnapshot
): FeatureScore | null {
  const homeQualified = snapshot.home.alreadyQualified ?? snapshot.alreadyQualified;
  const awayQualified = snapshot.away.alreadyQualified ?? snapshot.alreadyQualified;
  const homeEliminated = snapshot.home.alreadyEliminated ?? snapshot.alreadyEliminated;
  const awayEliminated = snapshot.away.alreadyEliminated ?? snapshot.alreadyEliminated;

  if (
    homeQualified === null &&
    awayQualified === null &&
    homeEliminated === null &&
    awayEliminated === null
  ) {
    return null;
  }

  const homeMotivation =
    (homeQualified ? -1 : 0) + (homeEliminated ? -1 : 0);
  const awayMotivation =
    (awayQualified ? -1 : 0) + (awayEliminated ? -1 : 0);
  const score = (homeMotivation - awayMotivation) * 18;

  return buildFeature(
    MATCH_CONTEXT_FEATURE_IDS.qualificationMotivation,
    "Qualification Motivation",
    "moneyline",
    score,
    "Qualification Motivation：已晉級或已淘汰會降低戰意。",
    buildMetadata(
      "Qualification Motivation",
      homeQualified ?? homeEliminated,
      awayQualified ?? awayEliminated,
      null
    ),
    primaryConfidence(true)
  );
}

function scoreDerbyMotivation(snapshot: MatchContextSnapshot): FeatureScore | null {
  if (snapshot.derbyMatch === null) {
    return null;
  }

  const score = snapshot.derbyMatch ? 16 : 0;

  return buildFeature(
    MATCH_CONTEXT_FEATURE_IDS.derbyMotivation,
    "Derby Motivation",
    "moneyline",
    score,
    snapshot.derbyMatch
      ? "Derby Motivation：德比戰，比賽強度提升。"
      : "Derby Motivation：非德比戰。",
    buildMetadata("Derby Motivation", null, null, snapshot.derbyMatch),
    primaryConfidence(true)
  );
}

function scoreCompetitionContext(snapshot: MatchContextSnapshot): FeatureScore | null {
  if (
    snapshot.cupMatch === null &&
    snapshot.leagueMatch === null &&
    snapshot.internationalBreak === null
  ) {
    return null;
  }

  let score = 0;
  if (snapshot.cupMatch) {
    score += 12;
  }
  if (snapshot.leagueMatch) {
    score += 4;
  }
  if (snapshot.internationalBreak) {
    score -= 6;
  }

  return buildFeature(
    MATCH_CONTEXT_FEATURE_IDS.competitionContext,
    "Competition Context",
    "moneyline",
    score,
    `Competition Context：${snapshot.cupMatch ? "盃賽" : "非盃賽"} / ${snapshot.leagueMatch ? "聯賽" : "非聯賽"}。`,
    buildMetadata(
      "Competition Context",
      snapshot.cupMatch,
      snapshot.leagueMatch,
      snapshot.internationalBreak
    ),
    primaryConfidence(snapshot.cupMatch !== null || snapshot.leagueMatch !== null)
  );
}

function compact(features: Array<FeatureScore | null>): FeatureScore[] {
  return features.filter((feature): feature is FeatureScore => feature !== null);
}

export function collectMatchContextFeatures(
  context: FeatureScoreContext
): FeatureScore[] {
  const { homeTeam, awayTeam, matchDate } = resolveTeams(context);
  if (!homeTeam || !awayTeam) {
    return [];
  }

  const provider = resolveProvider(context);
  const snapshot = provider.getMatchContext({ homeTeam, awayTeam, matchDate });

  if (isEmptySnapshot(snapshot)) {
    return [];
  }

  return compact([
    scoreFixtureCongestion(snapshot),
    scoreRestAdvantage(snapshot),
    scoreTravelFatigue(snapshot),
    scoreTimezoneImpact(snapshot),
    scoreNeutralVenue(snapshot),
    scoreWeatherImpact(snapshot),
    scoreHeatImpact(snapshot),
    scoreAltitudeImpact(snapshot),
    scoreMatchImportance(snapshot),
    scoreMustWinPressure(snapshot),
    scoreQualificationMotivation(snapshot),
    scoreDerbyMotivation(snapshot),
    scoreCompetitionContext(snapshot),
  ]);
}
