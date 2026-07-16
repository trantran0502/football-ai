import { EMPTY_GOALS_XG_METRICS } from "@/lib/analysis/featureScore/providers/goalsXgProvider";
import { EMPTY_TEAM_MATCH_CONTEXT } from "@/lib/analysis/featureScore/providers/matchContextProvider";
import { EMPTY_SCORING_PATTERN_METRICS } from "@/lib/analysis/featureScore/providers/scoringPatternProvider";
import { EMPTY_SQUAD_AVAILABILITY } from "@/lib/analysis/featureScore/providers/squadAvailabilityProvider";
import type {
  FeatureProviderKey,
  ProviderDataByKey,
} from "@/lib/providers/registry/types";

function emptyRecentFormTeam(teamName: string) {
  return {
    teamName,
    sampleSize: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    winRate: null,
    avgGoalsFor: null,
    avgGoalsAgainst: null,
    goalDifferencePerMatch: null,
    venueWinRate: null,
    momentum: null,
    cleanSheetRate: null,
    failedToScoreRate: null,
  };
}

export function buildUnavailableProviderData<K extends FeatureProviderKey>(
  providerKey: K,
  request: unknown
): ProviderDataByKey[K] {
  switch (providerKey) {
    case "recentForm": {
      const teamRequest = request as { homeTeam: string; awayTeam: string };
      return {
        home: emptyRecentFormTeam(teamRequest.homeTeam),
        away: emptyRecentFormTeam(teamRequest.awayTeam),
      } as ProviderDataByKey[K];
    }
    case "homeAway":
      return {
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
      } as unknown as ProviderDataByKey[K];
    case "goalsXg":
      return {
        home: { ...EMPTY_GOALS_XG_METRICS },
        away: { ...EMPTY_GOALS_XG_METRICS },
      } as unknown as ProviderDataByKey[K];
    case "scoringPattern":
      return {
        home: { ...EMPTY_SCORING_PATTERN_METRICS },
        away: { ...EMPTY_SCORING_PATTERN_METRICS },
      } as unknown as ProviderDataByKey[K];
    case "leagueStrength": {
      const leagueRequest = request as { leagueName: string };
      return {
        leagueName: leagueRequest.leagueName,
        leagueRanking: null,
        leagueTier: null,
        attackStrength: null,
        defenseStrength: null,
        averageGoals: null,
        averageGoalsConceded: null,
        sampleSize: 0,
        dataFreshnessDays: null,
      } as unknown as ProviderDataByKey[K];
    }
    case "h2h":
      return {
        matches: [],
        sampleSize: 0,
        dataFreshnessDays: null,
      } as unknown as ProviderDataByKey[K];
    case "squadAvailability":
      return {
        home: { ...EMPTY_SQUAD_AVAILABILITY },
        away: { ...EMPTY_SQUAD_AVAILABILITY },
        injuredCount: null,
        suspendedCount: null,
        doubtfulCount: null,
        unavailableCount: null,
        keyPlayersMissing: [],
        impactScore: null,
        dataFreshnessDays: null,
        sampleSize: 0,
      } as unknown as ProviderDataByKey[K];
    case "matchContext":
      return {
        home: { ...EMPTY_TEAM_MATCH_CONTEXT },
        away: { ...EMPTY_TEAM_MATCH_CONTEXT },
        isNeutralVenue: null,
        weatherCondition: null,
        temperature: null,
        humidity: null,
        altitude: null,
        competitionStage: null,
        mustWin: null,
        alreadyQualified: null,
        alreadyEliminated: null,
        derbyMatch: null,
        cupMatch: null,
        leagueMatch: null,
        internationalBreak: null,
        matchImportance: null,
        eliminated: null,
        neutralVenue: null,
        travelDistance: null,
        restDays: null,
        fixtureCongestion: null,
        weatherImpact: null,
        dataFreshnessDays: null,
        sampleSize: 0,
      } as unknown as ProviderDataByKey[K];
    default:
      throw new Error(`Unsupported provider key: ${providerKey}`);
  }
}
