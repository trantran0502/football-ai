import type { GoalsXgSnapshot, TeamGoalsXgMetrics } from "@/lib/analysis/featureScore/providers/goalsXgProvider";
import { EMPTY_GOALS_XG_METRICS } from "@/lib/analysis/featureScore/providers/goalsXgProvider";
import type { HomeAwaySnapshot } from "@/lib/analysis/featureScore/providers/homeAwayProvider";
import type {
  RecentFormMatchup,
  RecentFormTeamSnapshot,
} from "@/lib/analysis/featureScore/providers/recentFormProvider";
import type {
  ScoringPatternSnapshot,
  TeamScoringPatternMetrics,
} from "@/lib/analysis/featureScore/providers/scoringPatternProvider";
import { EMPTY_SCORING_PATTERN_METRICS } from "@/lib/analysis/featureScore/providers/scoringPatternProvider";
import type { TeamProfile } from "@/lib/teamProfile/teamProfileTypes";

function roundRate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function isUsableTeamProfile(profile: TeamProfile | null | undefined): boolean {
  if (!profile) {
    return false;
  }
  if (profile.sampleSize <= 0) {
    return false;
  }
  return profile.source !== "incomplete" && profile.source !== "refresh_failed";
}

function mapMomentum(profile: TeamProfile): number | null {
  if (profile.momentumScore === null) {
    return null;
  }
  return roundRate((profile.momentumScore - 50) / 50);
}

function mapRecentFormTeamSnapshot(
  profile: TeamProfile,
  venueWinRate: number | null
): RecentFormTeamSnapshot {
  const sampleSize = profile.sampleSize;
  const wins = profile.recent10Wins ?? 0;
  const draws = profile.recent10Draws ?? 0;
  const losses = profile.recent10Losses ?? 0;
  const avgGoalsFor = profile.recent10AvgGoals;
  const avgGoalsAgainst = profile.recent10AvgConceded;

  return {
    teamName: profile.teamName,
    sampleSize,
    wins,
    draws,
    losses,
    goalsFor:
      avgGoalsFor !== null ? roundRate(avgGoalsFor * sampleSize) : 0,
    goalsAgainst:
      avgGoalsAgainst !== null ? roundRate(avgGoalsAgainst * sampleSize) : 0,
    winRate:
      profile.recent10Wins !== null && sampleSize > 0
        ? roundRate(profile.recent10Wins / sampleSize)
        : null,
    avgGoalsFor,
    avgGoalsAgainst,
    goalDifferencePerMatch:
      avgGoalsFor !== null && avgGoalsAgainst !== null
        ? roundRate(avgGoalsFor - avgGoalsAgainst)
        : null,
    venueWinRate,
    momentum: mapMomentum(profile),
    cleanSheetRate: profile.cleanSheetRate,
    failedToScoreRate: profile.failedToScoreRate,
  };
}

export function mapTeamProfilesToRecentForm(
  home: TeamProfile,
  away: TeamProfile
): RecentFormMatchup {
  return {
    home: mapRecentFormTeamSnapshot(home, home.home5WinRate),
    away: mapRecentFormTeamSnapshot(away, away.away5WinRate),
  };
}

export function mapTeamProfilesToHomeAway(
  home: TeamProfile,
  away: TeamProfile
): HomeAwaySnapshot {
  return {
    homeLast5: [],
    awayLast5: [],
    homeWinRate: home.home5WinRate,
    awayWinRate: away.away5WinRate,
    homeGoalsFor: home.home5AvgGoals,
    awayGoalsFor: away.away5AvgGoals,
    homeGoalsAgainst: home.home5AvgConceded,
    awayGoalsAgainst: away.away5AvgConceded,
    homeCleanSheetRate: home.cleanSheetRate,
    awayCleanSheetRate: away.cleanSheetRate,
  };
}

function mapGoalsXgTeam(profile: TeamProfile): TeamGoalsXgMetrics {
  const shots = profile.avgShots;
  const shotsOnTarget = profile.avgShotsOnTarget;
  const averageGoalsFor = profile.recent10AvgGoals;
  const conversionRate =
    averageGoalsFor !== null && shots !== null && shots > 0
      ? roundRate(averageGoalsFor / shots)
      : null;
  const shotAccuracy =
    shotsOnTarget !== null && shots !== null && shots > 0
      ? roundRate(shotsOnTarget / shots)
      : null;

  return {
    averageGoalsFor,
    averageGoalsAgainst: profile.recent10AvgConceded,
    xG: profile.avgXg,
    xGA: profile.avgXga,
    shots,
    shotsOnTarget,
    conversionRate,
    shotAccuracy,
  };
}

export function mapTeamProfilesToGoalsXg(
  home: TeamProfile,
  away: TeamProfile
): GoalsXgSnapshot {
  return {
    home: mapGoalsXgTeam(home),
    away: mapGoalsXgTeam(away),
  };
}

function mapScoringPatternTeam(profile: TeamProfile): TeamScoringPatternMetrics {
  const averageTotalGoals =
    profile.recent10AvgGoals !== null && profile.recent10AvgConceded !== null
      ? roundRate(profile.recent10AvgGoals + profile.recent10AvgConceded)
      : null;

  return {
    sampleSize: profile.sampleSize,
    over15Rate: null,
    over25Rate: profile.over25Rate,
    over35Rate: profile.over35Rate,
    bttsRate: profile.bttsRate,
    cleanSheetRate: profile.cleanSheetRate,
    failedToScoreRate: profile.failedToScoreRate,
    averageTotalGoals,
    firstHalfOver05Rate: null,
    firstHalfOver15Rate: null,
  };
}

export function mapTeamProfilesToScoringPattern(
  home: TeamProfile,
  away: TeamProfile
): ScoringPatternSnapshot {
  return {
    home: mapScoringPatternTeam(home),
    away: mapScoringPatternTeam(away),
  };
}

export function buildEmptyGoalsXgSnapshot(): GoalsXgSnapshot {
  return {
    home: { ...EMPTY_GOALS_XG_METRICS },
    away: { ...EMPTY_GOALS_XG_METRICS },
  };
}

export function buildEmptyScoringPatternSnapshot(): ScoringPatternSnapshot {
  return {
    home: { ...EMPTY_SCORING_PATTERN_METRICS },
    away: { ...EMPTY_SCORING_PATTERN_METRICS },
  };
}
