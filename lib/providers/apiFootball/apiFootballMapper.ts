import type { GoalsXgSnapshot } from "@/lib/analysis/featureScore/providers/goalsXgProvider";
import type { H2HSnapshot } from "@/lib/analysis/featureScore/providers/h2hProvider";
import type { HomeAwaySnapshot, FormResult } from "@/lib/analysis/featureScore/providers/homeAwayProvider";
import type { LeagueStrengthSnapshot } from "@/lib/analysis/featureScore/providers/leagueStrengthProvider";
import type { MatchContextSnapshot } from "@/lib/analysis/featureScore/providers/matchContextProvider";
import type { RecentFormMatchup } from "@/lib/analysis/featureScore/providers/recentFormProvider";
import type { ScoringPatternSnapshot } from "@/lib/analysis/featureScore/providers/scoringPatternProvider";
import type { SquadAvailabilitySnapshot } from "@/lib/analysis/featureScore/providers/squadAvailabilityProvider";
import type {
  ApiFootballFixtureRecord,
  ApiFootballMatchBundle,
  ApiFootballStandingRecord,
  ApiFootballTeamFormRecord,
  ApiFootballTeamStatisticsRecord,
} from "@/lib/providers/apiFootball/apiFootballTypes";
import { calculateTeamRecentForm, toRecentMatchSummary } from "@/lib/providers/free/recentFormCalculator";

function roundRate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function outcomeForTeam(
  fixture: ApiFootballFixtureRecord,
  teamId: number
): FormResult {
  const isHome = fixture.homeTeamId === teamId;
  const scored = isHome ? fixture.homeGoals ?? 0 : fixture.awayGoals ?? 0;
  const conceded = isHome ? fixture.awayGoals ?? 0 : fixture.homeGoals ?? 0;
  if (scored > conceded) {
    return "W";
  }
  if (scored < conceded) {
    return "L";
  }
  return "D";
}

function buildFormResults(
  form: ApiFootballTeamFormRecord,
  perspectiveTeamId: number
): FormResult[] {
  return form.fixtures.slice(0, 5).map((fixture) => outcomeForTeam(fixture, perspectiveTeamId));
}

function averageFromFixtures(
  fixtures: ApiFootballFixtureRecord[],
  teamId: number,
  metric: "for" | "against"
): number | null {
  if (fixtures.length === 0) {
    return null;
  }
  const total = fixtures.reduce((sum, fixture) => {
    const isHome = fixture.homeTeamId === teamId;
    const value =
      metric === "for"
        ? isHome
          ? fixture.homeGoals ?? 0
          : fixture.awayGoals ?? 0
        : isHome
          ? fixture.awayGoals ?? 0
          : fixture.homeGoals ?? 0;
    return sum + value;
  }, 0);
  return roundRate(total / fixtures.length);
}

function cleanSheetRate(
  fixtures: ApiFootballFixtureRecord[],
  teamId: number
): number | null {
  if (fixtures.length === 0) {
    return null;
  }
  const cleanSheets = fixtures.filter((fixture) => {
    const isHome = fixture.homeTeamId === teamId;
    const conceded = isHome ? fixture.awayGoals ?? 0 : fixture.homeGoals ?? 0;
    return conceded === 0;
  }).length;
  return roundRate(cleanSheets / fixtures.length);
}

function normalizeStrength(value: number, max: number): number {
  return roundRate(Math.min(1, Math.max(0, value / max)));
}

function toCompletedMatchSummary(
  fixture: ApiFootballFixtureRecord,
  teamName: string
) {
  if (fixture.homeGoals === null || fixture.awayGoals === null) {
    return null;
  }
  return toRecentMatchSummary(
    {
      fixtureId: fixture.fixtureId,
      date: fixture.date,
      league: fixture.league,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      homeGoals: fixture.homeGoals,
      awayGoals: fixture.awayGoals,
      halfTimeHome: fixture.halfTimeHome,
      halfTimeAway: fixture.halfTimeAway,
    },
    teamName
  );
}

export function mapRecentFormMatchup(bundle: ApiFootballMatchBundle): RecentFormMatchup {
  const homeMatches = bundle.homeForm.fixtures
    .map((fixture) => toCompletedMatchSummary(fixture, bundle.homeTeam.name))
    .filter((match): match is NonNullable<typeof match> => match !== null);
  const awayMatches = bundle.awayForm.fixtures
    .map((fixture) => toCompletedMatchSummary(fixture, bundle.awayTeam.name))
    .filter((match): match is NonNullable<typeof match> => match !== null);
  const homeForm = calculateTeamRecentForm(homeMatches);
  const awayForm = calculateTeamRecentForm(awayMatches);

  return {
    home: {
      teamName: bundle.homeTeam.name,
      sampleSize: homeForm.sampleSize,
      wins: homeForm.wins,
      draws: homeForm.draws,
      losses: homeForm.losses,
      goalsFor: homeForm.goalsFor,
      goalsAgainst: homeForm.goalsAgainst,
      winRate:
        homeForm.sampleSize > 0
          ? roundRate(homeForm.wins / homeForm.sampleSize)
          : null,
      avgGoalsFor: homeForm.avgGoalsFor,
      avgGoalsAgainst: homeForm.avgGoalsAgainst,
      goalDifferencePerMatch:
        homeForm.sampleSize > 0
          ? roundRate((homeForm.goalsFor - homeForm.goalsAgainst) / homeForm.sampleSize)
          : null,
      venueWinRate:
        homeForm.sampleSize > 0
          ? roundRate(homeForm.wins / homeForm.sampleSize)
          : null,
      momentum:
        homeForm.sampleSize > 0
          ? roundRate((homeForm.wins - homeForm.losses) / homeForm.sampleSize)
          : null,
      cleanSheetRate:
        homeForm.sampleSize > 0
          ? roundRate(
              homeMatches.filter((match) => match.awayGoals === 0).length /
                homeForm.sampleSize
            )
          : null,
      failedToScoreRate:
        homeForm.sampleSize > 0
          ? roundRate(
              homeMatches.filter((match) => match.homeGoals === 0).length /
                homeForm.sampleSize
            )
          : null,
    },
    away: {
      teamName: bundle.awayTeam.name,
      sampleSize: awayForm.sampleSize,
      wins: awayForm.wins,
      draws: awayForm.draws,
      losses: awayForm.losses,
      goalsFor: awayForm.goalsFor,
      goalsAgainst: awayForm.goalsAgainst,
      winRate:
        awayForm.sampleSize > 0
          ? roundRate(awayForm.wins / awayForm.sampleSize)
          : null,
      avgGoalsFor: awayForm.avgGoalsFor,
      avgGoalsAgainst: awayForm.avgGoalsAgainst,
      goalDifferencePerMatch:
        awayForm.sampleSize > 0
          ? roundRate((awayForm.goalsFor - awayForm.goalsAgainst) / awayForm.sampleSize)
          : null,
      venueWinRate:
        awayForm.sampleSize > 0
          ? roundRate(awayForm.wins / awayForm.sampleSize)
          : null,
      momentum:
        awayForm.sampleSize > 0
          ? roundRate((awayForm.wins - awayForm.losses) / awayForm.sampleSize)
          : null,
      cleanSheetRate:
        awayForm.sampleSize > 0
          ? roundRate(
              awayMatches.filter((match) => match.homeGoals === 0).length /
                awayForm.sampleSize
            )
          : null,
      failedToScoreRate:
        awayForm.sampleSize > 0
          ? roundRate(
              awayMatches.filter((match) => match.awayGoals === 0).length /
                awayForm.sampleSize
            )
          : null,
    },
  };
}

export function mapLeagueStrengthSnapshot(
  leagueName: string,
  standings: ApiFootballStandingRecord[]
): LeagueStrengthSnapshot {
  if (standings.length === 0) {
    return {
      leagueName,
      leagueRanking: null,
      leagueTier: null,
      attackStrength: null,
      defenseStrength: null,
      averageGoals: null,
      averageGoalsConceded: null,
      sampleSize: 0,
      dataFreshnessDays: null,
    };
  }

  const averageGoals =
    standings.reduce((sum, row) => sum + row.goalsFor / Math.max(row.played, 1), 0) /
    standings.length;
  const averageGoalsConceded =
    standings.reduce((sum, row) => sum + row.goalsAgainst / Math.max(row.played, 1), 0) /
    standings.length;
  const topTeam = standings[0];

  return {
    leagueName,
    leagueRanking: topTeam.rank,
    leagueTier: topTeam.rank <= 10 ? 1 : topTeam.rank <= 30 ? 2 : 3,
    attackStrength: normalizeStrength(averageGoals, 3),
    defenseStrength: normalizeStrength(3 - averageGoalsConceded, 3),
    averageGoals: roundRate(averageGoals),
    averageGoalsConceded: roundRate(averageGoalsConceded),
    sampleSize: standings.reduce((sum, row) => sum + row.played, 0),
    dataFreshnessDays: null,
  };
}

export function mapHomeAwaySnapshot(bundle: ApiFootballMatchBundle): HomeAwaySnapshot {
  const homeFixtures = bundle.homeForm.fixtures;
  const awayFixtures = bundle.awayForm.fixtures;

  return {
    homeLast5: buildFormResults(bundle.homeForm, bundle.homeTeam.id),
    awayLast5: buildFormResults(bundle.awayForm, bundle.awayTeam.id),
    homeWinRate:
      homeFixtures.length > 0
        ? roundRate(
            homeFixtures.filter((fixture) => outcomeForTeam(fixture, bundle.homeTeam.id) === "W")
              .length / homeFixtures.length
          )
        : null,
    awayWinRate:
      awayFixtures.length > 0
        ? roundRate(
            awayFixtures.filter((fixture) => outcomeForTeam(fixture, bundle.awayTeam.id) === "W")
              .length / awayFixtures.length
          )
        : null,
    homeGoalsFor: averageFromFixtures(homeFixtures, bundle.homeTeam.id, "for"),
    awayGoalsFor: averageFromFixtures(awayFixtures, bundle.awayTeam.id, "for"),
    homeGoalsAgainst: averageFromFixtures(homeFixtures, bundle.homeTeam.id, "against"),
    awayGoalsAgainst: averageFromFixtures(awayFixtures, bundle.awayTeam.id, "against"),
    homeCleanSheetRate: cleanSheetRate(homeFixtures, bundle.homeTeam.id),
    awayCleanSheetRate: cleanSheetRate(awayFixtures, bundle.awayTeam.id),
  };
}

function mapTeamGoalsMetrics(
  stats: ApiFootballTeamStatisticsRecord | null,
  fixtures: ApiFootballFixtureRecord[],
  teamId: number
): GoalsXgSnapshot["home"] {
  const avgFor = averageFromFixtures(fixtures, teamId, "for");
  const avgAgainst = averageFromFixtures(fixtures, teamId, "against");
  const shots = stats?.shotsTotal ?? null;
  const shotsOnTarget = stats?.shotsOnTarget ?? null;

  return {
    averageGoalsFor: stats?.averageGoalsFor ?? avgFor,
    averageGoalsAgainst: stats?.averageGoalsAgainst ?? avgAgainst,
    xG: stats?.expectedGoals ?? null,
    xGA: stats?.expectedGoalsAgainst ?? null,
    shots,
    shotsOnTarget,
    conversionRate:
      shots && stats?.goalsFor
        ? roundRate(stats.goalsFor / shots)
        : null,
    shotAccuracy:
      shots && shotsOnTarget ? roundRate(shotsOnTarget / shots) : null,
  };
}

export function mapGoalsXgSnapshot(bundle: ApiFootballMatchBundle): GoalsXgSnapshot {
  return {
    home: mapTeamGoalsMetrics(
      bundle.homeStatistics,
      bundle.homeForm.fixtures,
      bundle.homeTeam.id
    ),
    away: mapTeamGoalsMetrics(
      bundle.awayStatistics,
      bundle.awayForm.fixtures,
      bundle.awayTeam.id
    ),
  };
}

function mapScoringMetrics(
  form: ApiFootballTeamFormRecord,
  teamId: number,
  teamName: string
) {
  const matches = form.fixtures
    .map((fixture) => toCompletedMatchSummary(fixture, teamName))
    .filter((match): match is NonNullable<typeof match> => match !== null);
  const recent = calculateTeamRecentForm(matches);
  const sampleSize = recent.sampleSize;
  const over15 = matches.filter(
    (match) => match.homeGoals + match.awayGoals > 1
  ).length;
  const over35 = matches.filter(
    (match) => match.homeGoals + match.awayGoals > 3
  ).length;

  return {
    over15Rate: sampleSize > 0 ? roundRate(over15 / sampleSize) : null,
    over25Rate: recent.over25Rate,
    over35Rate: sampleSize > 0 ? roundRate(over35 / sampleSize) : null,
    bttsRate: recent.bttsRate,
    cleanSheetRate:
      sampleSize > 0
        ? roundRate(
            form.fixtures.filter((fixture) => {
              const isHome = fixture.homeTeamId === teamId;
              const conceded = isHome ? fixture.awayGoals ?? 0 : fixture.homeGoals ?? 0;
              return conceded === 0;
            }).length / sampleSize
          )
        : null,
    failedToScoreRate:
      sampleSize > 0 ? roundRate(1 - (recent.scoredRate ?? 0)) : null,
    averageTotalGoals:
      sampleSize > 0
        ? roundRate(
            matches.reduce((sum, match) => sum + match.homeGoals + match.awayGoals, 0) /
              sampleSize
          )
        : null,
    firstHalfOver05Rate: recent.firstHalfGoalRate,
    firstHalfOver15Rate: null,
    sampleSize,
  };
}

export function mapScoringPatternSnapshot(
  bundle: ApiFootballMatchBundle
): ScoringPatternSnapshot {
  return {
    home: mapScoringMetrics(bundle.homeForm, bundle.homeTeam.id, bundle.homeTeam.name),
    away: mapScoringMetrics(bundle.awayForm, bundle.awayTeam.id, bundle.awayTeam.name),
  };
}

export function mapH2HSnapshot(
  bundle: ApiFootballMatchBundle,
  referenceDate?: string
): H2HSnapshot {
  const matches = bundle.headToHead.slice(0, 5).map((fixture) => ({
    matchDate: fixture.date,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    homeGoals: fixture.homeGoals,
    awayGoals: fixture.awayGoals,
    venue: fixture.venue ?? `${fixture.homeTeam} Home`,
    competition: fixture.league ?? "League",
    neutralVenue: fixture.neutralVenue,
  }));
  const mostRecent = matches[0]?.matchDate ?? null;
  const freshness =
    mostRecent && referenceDate
      ? Math.max(
          0,
          Math.round(
            (new Date(referenceDate).getTime() - new Date(mostRecent).getTime()) /
              86_400_000
          )
        )
      : null;

  return {
    matches,
    sampleSize: matches.length,
    dataFreshnessDays: freshness,
  };
}

export function mapSquadAvailabilitySnapshot(
  bundle: ApiFootballMatchBundle
): SquadAvailabilitySnapshot {
  const countInjuries = (teamId: number) =>
    bundle.injuries.filter((injury) => injury.teamId === teamId).length;

  const buildTeam = (teamId: number): SquadAvailabilitySnapshot["home"] => ({
    injuries: countInjuries(teamId),
    suspensions: null,
    doubtfulPlayers: null,
    expectedRotationCount: null,
    missingStartingXI: countInjuries(teamId),
    missingAttackers: null,
    missingMidfielders: null,
    missingDefenders: null,
    missingGoalkeeper: null,
    squadDepthScore: null,
    daysSinceLastMatch: daysSinceLastFixture(bundle, teamId),
    daysUntilNextMatch: null,
  });

  return {
    home: buildTeam(bundle.homeTeam.id),
    away: buildTeam(bundle.awayTeam.id),
    injuredCount: countInjuries(bundle.homeTeam.id) + countInjuries(bundle.awayTeam.id),
    suspendedCount: null,
    doubtfulCount: null,
    unavailableCount: null,
    keyPlayersMissing: [],
    impactScore: null,
    dataFreshnessDays: null,
    sampleSize: bundle.injuries.length,
  };
}

function daysSinceLastFixture(
  bundle: ApiFootballMatchBundle,
  teamId: number
): number | null {
  const fixtures =
    teamId === bundle.homeTeam.id ? bundle.homeForm.fixtures : bundle.awayForm.fixtures;
  const latest = fixtures[0]?.date;
  if (!latest) {
    return null;
  }
  const reference = bundle.fixture?.date ?? new Date().toISOString().split("T")[0];
  return Math.max(
    0,
    Math.round(
      (new Date(reference).getTime() - new Date(latest).getTime()) / 86_400_000
    )
  );
}

export function mapMatchContextSnapshot(
  bundle: ApiFootballMatchBundle
): MatchContextSnapshot {
  const fixture = bundle.fixture;
  return {
    home: {
      daysSinceLastMatch: daysSinceLastFixture(bundle, bundle.homeTeam.id),
      daysUntilNextMatch: null,
      matchesLast14Days: countRecentFixtures(bundle.homeForm.fixtures, 14),
      travelDistanceKm: null,
      travelTimeHours: null,
      timezoneDifference: null,
      mustWin: null,
      alreadyQualified: null,
      alreadyEliminated: null,
    },
    away: {
      daysSinceLastMatch: daysSinceLastFixture(bundle, bundle.awayTeam.id),
      daysUntilNextMatch: null,
      matchesLast14Days: countRecentFixtures(bundle.awayForm.fixtures, 14),
      travelDistanceKm: null,
      travelTimeHours: null,
      timezoneDifference: null,
      mustWin: null,
      alreadyQualified: null,
      alreadyEliminated: null,
    },
    isNeutralVenue: fixture?.neutralVenue ?? null,
    weatherCondition: null,
    temperature: null,
    humidity: null,
    altitude: null,
    competitionStage: fixture?.status ?? null,
    mustWin: null,
    alreadyQualified: null,
    alreadyEliminated: null,
    derbyMatch: null,
    cupMatch: null,
    leagueMatch: fixture?.league ? true : null,
    internationalBreak: null,
  };
}

function countRecentFixtures(
  fixtures: ApiFootballFixtureRecord[],
  days: number
): number | null {
  if (fixtures.length === 0) {
    return null;
  }
  const cutoff = Date.now() - days * 86_400_000;
  return fixtures.filter(
    (fixture) => new Date(fixture.date).getTime() >= cutoff
  ).length;
}

export function mapProviderDataFromBundle(
  providerKey: string,
  bundle: ApiFootballMatchBundle,
  leagueName?: string
): unknown {
  switch (providerKey) {
    case "recentForm":
      return mapRecentFormMatchup(bundle);
    case "leagueStrength":
      return mapLeagueStrengthSnapshot(
        leagueName ?? bundle.fixture?.league ?? "Unknown League",
        bundle.standings
      );
    case "homeAway":
      return mapHomeAwaySnapshot(bundle);
    case "goalsXg":
      return mapGoalsXgSnapshot(bundle);
    case "scoringPattern":
      return mapScoringPatternSnapshot(bundle);
    case "h2h":
      return mapH2HSnapshot(bundle, bundle.fixture?.date);
    case "squadAvailability":
      return mapSquadAvailabilitySnapshot(bundle);
    case "matchContext":
      return mapMatchContextSnapshot(bundle);
    default:
      return null;
  }
}
