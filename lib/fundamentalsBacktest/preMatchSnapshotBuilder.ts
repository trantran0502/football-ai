import { isOnOrAfterSource } from "@/lib/fundamentalsBacktest/dataLeakageValidator";
import type {
  HistoricalFixtureInput,
  HistoricalH2HInput,
  HistoricalMatchOutcomeInput,
  HistoricalStandingsEntry,
  PreMatchSnapshot,
  TeamFormSummary,
} from "@/lib/fundamentalsBacktest/fundamentalsBacktestTypes";

function parseInstant(value: string): number {
  return new Date(value).getTime();
}

function emptyForm(): TeamFormSummary {
  return {
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    latestIncludedMatchDate: null,
  };
}

function teamMatchesMatch(
  match: HistoricalMatchOutcomeInput,
  team: string,
  teamId: number | undefined
): boolean {
  return (
    match.homeTeam === team ||
    match.awayTeam === team ||
    (teamId !== undefined && (match.homeTeamId === teamId || match.awayTeamId === teamId))
  );
}

function summarizeTeamForm(
  team: string,
  teamId: number | undefined,
  matches: HistoricalMatchOutcomeInput[],
  fixtureDate: string,
  limit: number
): TeamFormSummary {
  const filtered = matches
    .filter((match) => parseInstant(match.matchDate) < parseInstant(fixtureDate))
    .filter((match) => teamMatchesMatch(match, team, teamId))
    .sort((left, right) => parseInstant(right.matchDate) - parseInstant(left.matchDate))
    .slice(0, limit);

  const summary = emptyForm();
  for (const match of filtered) {
    const isHome = match.homeTeam === team || match.homeTeamId === teamId;
    const goalsFor = isHome ? match.homeGoals : match.awayGoals;
    const goalsAgainst = isHome ? match.awayGoals : match.homeGoals;
    summary.played += 1;
    summary.goalsFor += goalsFor;
    summary.goalsAgainst += goalsAgainst;
    if (goalsFor > goalsAgainst) {
      summary.wins += 1;
    } else if (goalsFor === goalsAgainst) {
      summary.draws += 1;
    } else {
      summary.losses += 1;
    }
    if (
      !summary.latestIncludedMatchDate ||
      parseInstant(match.matchDate) > parseInstant(summary.latestIncludedMatchDate)
    ) {
      summary.latestIncludedMatchDate = match.matchDate;
    }
  }

  return summary;
}

function computeRate(values: boolean[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.filter(Boolean).length / values.length;
}

function buildTeamRates(
  team: string,
  teamId: number | undefined,
  matches: HistoricalMatchOutcomeInput[],
  fixtureDate: string
) {
  const filtered = matches
    .filter((match) => parseInstant(match.matchDate) < parseInstant(fixtureDate))
    .filter((match) => teamMatchesMatch(match, team, teamId))
    .slice(0, 10);

  const overUnder: boolean[] = [];
  const btts: boolean[] = [];
  const cleanSheets: boolean[] = [];
  const failedToScore: boolean[] = [];

  for (const match of filtered) {
    const isHome = match.homeTeam === team || match.homeTeamId === teamId;
    const goalsFor = isHome ? match.homeGoals : match.awayGoals;
    const goalsAgainst = isHome ? match.awayGoals : match.homeGoals;
    const totalGoals = match.homeGoals + match.awayGoals;
    overUnder.push(totalGoals > 2.5);
    btts.push(match.homeGoals > 0 && match.awayGoals > 0);
    cleanSheets.push(goalsAgainst === 0);
    failedToScore.push(goalsFor === 0);
  }

  return {
    overUnderRate: computeRate(overUnder),
    bttsRate: computeRate(btts),
    cleanSheetRate: computeRate(cleanSheets),
    failedToScoreRate: computeRate(failedToScore),
  };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildH2H(
  fixture: HistoricalFixtureInput,
  matches: HistoricalMatchOutcomeInput[],
  fixtureDate: string
): HistoricalH2HInput | null {
  const prior = matches.filter(
    (match) =>
      parseInstant(match.matchDate) < parseInstant(fixtureDate) &&
      ((match.homeTeam === fixture.homeTeam && match.awayTeam === fixture.awayTeam) ||
        (match.homeTeam === fixture.awayTeam && match.awayTeam === fixture.homeTeam))
  );

  if (prior.length === 0) {
    return null;
  }

  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  let latestIncludedMatchDate = prior[0]!.matchDate;

  for (const match of prior) {
    if (parseInstant(match.matchDate) > parseInstant(latestIncludedMatchDate)) {
      latestIncludedMatchDate = match.matchDate;
    }
    const fixtureHomeAtHome =
      match.homeTeam === fixture.homeTeam && match.awayTeam === fixture.awayTeam;
    const homeGoals = fixtureHomeAtHome ? match.homeGoals : match.awayGoals;
    const awayGoals = fixtureHomeAtHome ? match.awayGoals : match.homeGoals;
    if (homeGoals > awayGoals) {
      homeWins += 1;
    } else if (homeGoals < awayGoals) {
      awayWins += 1;
    } else {
      draws += 1;
    }
  }

  return {
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    homeWins,
    awayWins,
    draws,
    latestIncludedMatchDate,
  };
}

function buildAverageMetric(
  team: string,
  teamId: number | undefined,
  matches: HistoricalMatchOutcomeInput[],
  fixtureDate: string,
  selector: (match: HistoricalMatchOutcomeInput, isHome: boolean) => number | null | undefined
): number | null {
  const values = matches
    .filter((match) => parseInstant(match.matchDate) < parseInstant(fixtureDate))
    .filter((match) => teamMatchesMatch(match, team, teamId))
    .slice(0, 10)
    .map((match) => {
      const isHome = match.homeTeam === team || match.homeTeamId === teamId;
      return selector(match, isHome);
    })
    .filter((value): value is number => typeof value === "number");

  return values.length > 0 ? average(values) : null;
}

export function buildPreMatchSnapshot(input: {
  fixture: HistoricalFixtureInput;
  matchOutcomes: HistoricalMatchOutcomeInput[];
  standings?: HistoricalStandingsEntry[];
  actualResult?: PreMatchSnapshot["actualResult"];
  storedMarketSnapshot?: PreMatchSnapshot["storedMarketSnapshot"];
  squadAvailability?: PreMatchSnapshot["squadAvailabilityBeforeMatch"];
  scheduleContext?: PreMatchSnapshot["scheduleContextBeforeMatch"];
  sourceTimestamp?: string;
}): PreMatchSnapshot {
  const { fixture, matchOutcomes } = input;
  const fixtureDate = fixture.fixtureDate;
  const homeRecent = summarizeTeamForm(
    fixture.homeTeam,
    fixture.homeTeamId,
    matchOutcomes,
    fixtureDate,
    10
  );
  const awayRecent = summarizeTeamForm(
    fixture.awayTeam,
    fixture.awayTeamId,
    matchOutcomes,
    fixtureDate,
    10
  );
  const homeRates = buildTeamRates(fixture.homeTeam, fixture.homeTeamId, matchOutcomes, fixtureDate);
  const awayRates = buildTeamRates(fixture.awayTeam, fixture.awayTeamId, matchOutcomes, fixtureDate);

  const standingsBeforeMatch = (input.standings ?? []).filter(
    (entry) => !isOnOrAfterSource(entry.snapshotDate, fixtureDate)
  );

  return {
    fixtureId: fixture.fixtureId,
    fixtureDate,
    leagueId: fixture.leagueId,
    leagueName: fixture.leagueName,
    season: fixture.season,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    recent10BeforeMatch: { home: homeRecent, away: awayRecent },
    homeFormBeforeMatch: homeRecent,
    awayFormBeforeMatch: awayRecent,
    averageGoalsForBeforeMatch: {
      home: homeRecent.played > 0 ? homeRecent.goalsFor / homeRecent.played : 0,
      away: awayRecent.played > 0 ? awayRecent.goalsFor / awayRecent.played : 0,
    },
    averageGoalsAgainstBeforeMatch: {
      home: homeRecent.played > 0 ? homeRecent.goalsAgainst / homeRecent.played : 0,
      away: awayRecent.played > 0 ? awayRecent.goalsAgainst / awayRecent.played : 0,
    },
    xGBeforeMatch: {
      home: buildAverageMetric(fixture.homeTeam, fixture.homeTeamId, matchOutcomes, fixtureDate, (match, isHome) =>
        isHome ? match.xGHome : match.xGAway
      ),
      away: buildAverageMetric(fixture.awayTeam, fixture.awayTeamId, matchOutcomes, fixtureDate, (match, isHome) =>
        isHome ? match.xGHome : match.xGAway
      ),
    },
    xGABeforeMatch: {
      home: buildAverageMetric(fixture.homeTeam, fixture.homeTeamId, matchOutcomes, fixtureDate, (match, isHome) =>
        isHome ? match.xGAway : match.xGHome
      ),
      away: buildAverageMetric(fixture.awayTeam, fixture.awayTeamId, matchOutcomes, fixtureDate, (match, isHome) =>
        isHome ? match.xGAway : match.xGHome
      ),
    },
    shotsBeforeMatch: {
      home: buildAverageMetric(fixture.homeTeam, fixture.homeTeamId, matchOutcomes, fixtureDate, (match, isHome) =>
        isHome ? match.shotsHome : match.shotsAway
      ),
      away: buildAverageMetric(fixture.awayTeam, fixture.awayTeamId, matchOutcomes, fixtureDate, (match, isHome) =>
        isHome ? match.shotsHome : match.shotsAway
      ),
    },
    shotsOnTargetBeforeMatch: {
      home: buildAverageMetric(fixture.homeTeam, fixture.homeTeamId, matchOutcomes, fixtureDate, (match, isHome) =>
        isHome ? match.shotsOnTargetHome : match.shotsOnTargetAway
      ),
      away: buildAverageMetric(fixture.awayTeam, fixture.awayTeamId, matchOutcomes, fixtureDate, (match, isHome) =>
        isHome ? match.shotsOnTargetHome : match.shotsOnTargetAway
      ),
    },
    possessionBeforeMatch: {
      home: buildAverageMetric(fixture.homeTeam, fixture.homeTeamId, matchOutcomes, fixtureDate, (match, isHome) =>
        isHome ? match.possessionHome : match.possessionAway
      ),
      away: buildAverageMetric(fixture.awayTeam, fixture.awayTeamId, matchOutcomes, fixtureDate, (match, isHome) =>
        isHome ? match.possessionHome : match.possessionAway
      ),
    },
    overUnderRateBeforeMatch: {
      home: homeRates.overUnderRate,
      away: awayRates.overUnderRate,
    },
    bttsRateBeforeMatch: {
      home: homeRates.bttsRate,
      away: awayRates.bttsRate,
    },
    cleanSheetRateBeforeMatch: {
      home: homeRates.cleanSheetRate,
      away: awayRates.cleanSheetRate,
    },
    failedToScoreRateBeforeMatch: {
      home: homeRates.failedToScoreRate,
      away: awayRates.failedToScoreRate,
    },
    h2hBeforeMatch: buildH2H(fixture, matchOutcomes, fixtureDate),
    standingsBeforeMatch,
    squadAvailabilityBeforeMatch: input.squadAvailability ?? null,
    scheduleContextBeforeMatch: input.scheduleContext ?? null,
    matchImportanceBeforeMatch: input.scheduleContext?.matchImportance ?? null,
    actualResult: input.actualResult ?? null,
    storedMarketSnapshot: input.storedMarketSnapshot ?? null,
    sourceTimestamp: input.sourceTimestamp ?? new Date(new Date(fixtureDate).getTime() - 3_600_000).toISOString(),
    dataMode: input.storedMarketSnapshot?.length ? "live_market_snapshot" : "historical_fundamentals",
  };
}
