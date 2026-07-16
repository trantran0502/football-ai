import type {
  FeatureProviderKey,
  ProviderDataByKey,
  ProviderRequestByKey,
} from "@/lib/providers/registry/types";
import type { NormalizedTeamContext } from "@/lib/hybrid/hybridTypes";
import type { RecentFormMatchup } from "@/lib/analysis/featureScore/providers/recentFormProvider";
import type { H2HSnapshot } from "@/lib/analysis/featureScore/providers/h2hProvider";
import type { LeagueStrengthSnapshot } from "@/lib/analysis/featureScore/providers/leagueStrengthProvider";
import type { SquadAvailabilitySnapshot } from "@/lib/analysis/featureScore/providers/squadAvailabilityProvider";
import type { HybridMatchRecord } from "@/lib/hybrid/hybridTypes";

function roundRate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function summarizeForm(
  teamName: string,
  matches: HybridMatchRecord[]
): RecentFormMatchup["home"] {
  const sampleSize = matches.length;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let cleanSheets = 0;
  let failedToScore = 0;

  for (const match of matches) {
    const isHome = match.homeTeam.toLowerCase() === teamName.toLowerCase();
    const scored = isHome ? match.homeGoals : match.awayGoals;
    const conceded = isHome ? match.awayGoals : match.homeGoals;
    if (scored === null || conceded === null) {
      continue;
    }
    goalsFor += scored;
    goalsAgainst += conceded;
    if (scored > conceded) {
      wins += 1;
    } else if (scored < conceded) {
      losses += 1;
    } else {
      draws += 1;
    }
    if (conceded === 0) {
      cleanSheets += 1;
    }
    if (scored === 0) {
      failedToScore += 1;
    }
  }

  const decisive = wins + draws + losses;
  return {
    teamName,
    sampleSize: decisive,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    winRate: decisive > 0 ? roundRate(wins / decisive) : null,
    avgGoalsFor: decisive > 0 ? roundRate(goalsFor / decisive) : null,
    avgGoalsAgainst: decisive > 0 ? roundRate(goalsAgainst / decisive) : null,
    goalDifferencePerMatch:
      decisive > 0 ? roundRate((goalsFor - goalsAgainst) / decisive) : null,
    venueWinRate: decisive > 0 ? roundRate(wins / decisive) : null,
    momentum: decisive > 0 ? roundRate((wins - losses) / decisive) : null,
    cleanSheetRate: decisive > 0 ? roundRate(cleanSheets / decisive) : null,
    failedToScoreRate: decisive > 0 ? roundRate(failedToScore / decisive) : null,
  };
}

function toH2HSnapshot(matches: HybridMatchRecord[]): H2HSnapshot {
  const limited = matches.slice(0, 5);
  const mostRecent = limited[0]?.matchDate ?? null;
  return {
    matches: limited.map((match) => ({
      matchDate: match.matchDate,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeGoals: match.homeGoals,
      awayGoals: match.awayGoals,
      venue: match.neutralVenue ? "Neutral" : `${match.homeTeam} Home`,
      competition: match.competition,
      neutralVenue: match.neutralVenue,
    })),
    sampleSize: limited.length,
    dataFreshnessDays: mostRecent
      ? Math.max(
          0,
          Math.round(
            (Date.now() - Date.parse(mostRecent)) / 86_400_000
          )
        )
      : null,
  };
}

export function extractProviderDataFromContext<K extends FeatureProviderKey>(
  providerKey: K,
  context: NormalizedTeamContext,
  request: ProviderRequestByKey[K]
): ProviderDataByKey[K] | null {
  switch (providerKey) {
    case "recentForm": {
      const homeMatches =
        context.recentFormLast10Official.value?.matches ??
        context.recentFormLast5Home.value?.matches ??
        [];
      const awayMatches =
        context.recentFormLast10Official.value?.matches ??
        context.recentFormLast5Away.value?.matches ??
        [];
      return {
        home: summarizeForm(context.homeTeam, homeMatches),
        away: summarizeForm(context.awayTeam, awayMatches),
      } as ProviderDataByKey[K];
    }
    case "h2h": {
      const matches = context.h2hLast5Official.value ?? [];
      return toH2HSnapshot(matches) as ProviderDataByKey[K];
    }
    case "leagueStrength": {
      const leagueRequest = request as ProviderRequestByKey["leagueStrength"];
      const standings = context.standings.value ?? [];
      const averageGoals =
        standings.length > 0
          ? roundRate(
              standings.reduce(
                (sum, row) => sum + (row.goalsFor ?? 0) / Math.max(row.played ?? 1, 1),
                0
              ) / standings.length
            )
          : null;
      const averageGoalsConceded =
        standings.length > 0
          ? roundRate(
              standings.reduce(
                (sum, row) =>
                  sum + (row.goalsAgainst ?? 0) / Math.max(row.played ?? 1, 1),
                0
              ) / standings.length
            )
          : null;
      const snapshot: LeagueStrengthSnapshot = {
        leagueName: leagueRequest.leagueName,
        leagueRanking: standings[0]?.rank ?? null,
        leagueTier: 1,
        attackStrength: averageGoals !== null ? roundRate(averageGoals / 4) : null,
        defenseStrength:
          averageGoalsConceded !== null
            ? roundRate(1 - averageGoalsConceded / 4)
            : null,
        averageGoals,
        averageGoalsConceded,
        sampleSize: standings.reduce((sum, row) => sum + (row.played ?? 0), 0),
        dataFreshnessDays: null,
      };
      return snapshot as ProviderDataByKey[K];
    }
    case "squadAvailability": {
      const injuries = context.injuries.value ?? [];
      const homeCount = injuries.filter(
        (item) => item.teamName.toLowerCase() === context.homeTeam.toLowerCase()
      ).length;
      const awayCount = injuries.filter(
        (item) => item.teamName.toLowerCase() === context.awayTeam.toLowerCase()
      ).length;
      const snapshot: SquadAvailabilitySnapshot = {
        home: {
          injuries: homeCount,
          suspensions: null,
          doubtfulPlayers: null,
          expectedRotationCount: null,
          missingStartingXI: null,
          missingAttackers: null,
          missingMidfielders: null,
          missingDefenders: null,
          missingGoalkeeper: null,
          squadDepthScore: null,
          daysSinceLastMatch: null,
          daysUntilNextMatch: null,
        },
        away: {
          injuries: awayCount,
          suspensions: null,
          doubtfulPlayers: null,
          expectedRotationCount: null,
          missingStartingXI: null,
          missingAttackers: null,
          missingMidfielders: null,
          missingDefenders: null,
          missingGoalkeeper: null,
          squadDepthScore: null,
          daysSinceLastMatch: null,
          daysUntilNextMatch: null,
        },
      };
      return snapshot as ProviderDataByKey[K];
    }
    default:
      return null;
  }
}
