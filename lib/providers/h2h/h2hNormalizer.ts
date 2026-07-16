import type { H2HMatchRecord, H2HSnapshot } from "@/lib/analysis/featureScore/providers/h2hProvider";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";

export const COMPLETED_FIXTURE_STATUSES = new Set(["FT", "AET", "PEN"]);
export const EXCLUDED_FIXTURE_STATUSES = new Set(["CANC", "ABD", "PST", "NS"]);

const FRIENDLY_PATTERN = /friendly|friendlies|amical|amistoso/i;

export interface H2HNormalizationStats {
  filteredFriendlyCount: number;
  filteredIncompleteCount: number;
  filteredStatusCount: number;
}

function normalizeTeamName(value: string): string {
  return value.trim().toLowerCase();
}

function teamsEqual(left: string, right: string): boolean {
  return normalizeTeamName(left) === normalizeTeamName(right);
}

export function isFriendlyCompetition(competition: string | null | undefined): boolean {
  if (!competition) {
    return false;
  }
  return FRIENDLY_PATTERN.test(competition);
}

export function isFormalCompletedFixture(input: {
  status?: string | null;
  competition?: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
}): boolean {
  if (input.homeGoals === null || input.awayGoals === null) {
    return false;
  }
  if (isFriendlyCompetition(input.competition)) {
    return false;
  }
  if (input.status) {
    if (EXCLUDED_FIXTURE_STATUSES.has(input.status)) {
      return false;
    }
    if (!COMPLETED_FIXTURE_STATUSES.has(input.status)) {
      return false;
    }
  }
  return true;
}

export function historicalRecordToH2HMatch(
  record: HistoricalMatchRecord
): H2HMatchRecord | null {
  if (record.status !== "VERIFIED" || !record.result) {
    return null;
  }

  const homeGoals = record.result.fullTimeHomeGoals;
  const awayGoals = record.result.fullTimeAwayGoals;
  if (!isFormalCompletedFixture({
    homeGoals,
    awayGoals,
    competition: record.league,
  })) {
    return null;
  }

  return {
    matchDate: record.matchDate,
    homeTeam: record.homeTeam,
    awayTeam: record.awayTeam,
    homeGoals,
    awayGoals,
    venue: `${record.homeTeam} Home`,
    competition: record.league,
    neutralVenue: false,
  };
}

export function apiFixtureToH2HMatch(
  fixture: ApiFootballFixtureRecord
): H2HMatchRecord | null {
  if (
    !isFormalCompletedFixture({
      status: fixture.status,
      competition: fixture.league,
      homeGoals: fixture.homeGoals,
      awayGoals: fixture.awayGoals,
    })
  ) {
    return null;
  }

  return {
    matchDate: fixture.date,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    homeGoals: fixture.homeGoals,
    awayGoals: fixture.awayGoals,
    venue: fixture.venue ?? `${fixture.homeTeam} Home`,
    competition: fixture.league ?? "League",
    neutralVenue: fixture.neutralVenue,
  };
}

interface ParsedPerspectiveMatch {
  outcome: "W" | "D" | "L";
  goalsForCurrentHome: number;
  goalsForCurrentAway: number;
  totalGoals: number;
  btts: boolean;
  over25: boolean;
  venueRelevant: boolean;
}

function parsePerspectiveMatch(
  record: H2HMatchRecord,
  currentHome: string,
  currentAway: string
): ParsedPerspectiveMatch | null {
  if (record.homeGoals === null || record.awayGoals === null) {
    return null;
  }

  let goalsForCurrentHome: number;
  let goalsForCurrentAway: number;
  let venueRelevant = false;

  if (teamsEqual(record.homeTeam, currentHome) && teamsEqual(record.awayTeam, currentAway)) {
    goalsForCurrentHome = record.homeGoals;
    goalsForCurrentAway = record.awayGoals;
    venueRelevant = !record.neutralVenue;
  } else if (
    teamsEqual(record.homeTeam, currentAway) &&
    teamsEqual(record.awayTeam, currentHome)
  ) {
    goalsForCurrentHome = record.awayGoals;
    goalsForCurrentAway = record.homeGoals;
    venueRelevant = false;
  } else {
    return null;
  }

  let outcome: "W" | "D" | "L" = "D";
  if (goalsForCurrentHome > goalsForCurrentAway) {
    outcome = "W";
  } else if (goalsForCurrentHome < goalsForCurrentAway) {
    outcome = "L";
  }

  const totalGoals = goalsForCurrentHome + goalsForCurrentAway;

  return {
    outcome,
    goalsForCurrentHome,
    goalsForCurrentAway,
    totalGoals,
    btts: goalsForCurrentHome > 0 && goalsForCurrentAway > 0,
    over25: totalGoals > 2,
    venueRelevant,
  };
}

function roundRate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function daysBetween(later: string, earlier: string): number {
  const end = new Date(later).getTime();
  const start = new Date(earlier).getTime();
  if (!Number.isFinite(end) || !Number.isFinite(start)) {
    return 0;
  }
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

export function buildH2HSnapshotFromMatches(input: {
  matches: H2HMatchRecord[];
  referenceDate: string;
  currentHomeTeam: string;
  currentAwayTeam: string;
}): H2HSnapshot {
  const limited = input.matches
    .slice()
    .sort(
      (left, right) =>
        new Date(right.matchDate).getTime() - new Date(left.matchDate).getTime()
    )
    .slice(0, 5);

  const parsed = limited
    .map((record) => parsePerspectiveMatch(record, input.currentHomeTeam, input.currentAwayTeam))
    .filter((item): item is ParsedPerspectiveMatch => item !== null);

  const sampleSize = parsed.length;
  const mostRecent = limited[0]?.matchDate ?? null;
  const dataFreshnessDays =
    mostRecent !== null ? daysBetween(input.referenceDate, mostRecent) : null;

  if (sampleSize === 0) {
    return {
      matches: [],
      sampleSize: 0,
      dataFreshnessDays: null,
      homeWinRate: null,
      awayWinRate: null,
      drawRate: null,
      averageGoals: null,
      goalDifference: null,
      bttsRate: null,
      over25Rate: null,
      venueRelevantSampleSize: null,
      venueRelevantHomeWinRate: null,
    };
  }

  const homeWins = parsed.filter((item) => item.outcome === "W").length;
  const awayWins = parsed.filter((item) => item.outcome === "L").length;
  const draws = parsed.filter((item) => item.outcome === "D").length;
  const venueMatches = parsed.filter((item) => item.venueRelevant);
  const venueHomeWins = venueMatches.filter((item) => item.outcome === "W").length;
  const averageGoals =
    parsed.reduce((sum, item) => sum + item.totalGoals, 0) / sampleSize;
  const goalDifference =
    parsed.reduce(
      (sum, item) => sum + (item.goalsForCurrentHome - item.goalsForCurrentAway),
      0
    ) / sampleSize;
  const bttsRate = parsed.filter((item) => item.btts).length / sampleSize;
  const over25Rate = parsed.filter((item) => item.over25).length / sampleSize;

  return {
    matches: limited,
    sampleSize,
    dataFreshnessDays,
    homeWinRate: roundRate(homeWins / sampleSize),
    awayWinRate: roundRate(awayWins / sampleSize),
    drawRate: roundRate(draws / sampleSize),
    averageGoals: roundRate(averageGoals),
    goalDifference: roundRate(goalDifference),
    bttsRate: roundRate(bttsRate),
    over25Rate: roundRate(over25Rate),
    venueRelevantSampleSize: venueMatches.length,
    venueRelevantHomeWinRate:
      venueMatches.length > 0
        ? roundRate(venueHomeWins / venueMatches.length)
        : null,
  };
}

export function findH2HMatchRecordsFromHistory(
  records: HistoricalMatchRecord[],
  homeTeam: string,
  awayTeam: string,
  matchDate?: string
): { matches: H2HMatchRecord[]; stats: H2HNormalizationStats } {
  const stats: H2HNormalizationStats = {
    filteredFriendlyCount: 0,
    filteredIncompleteCount: 0,
    filteredStatusCount: 0,
  };

  const candidates = records
    .filter((record) => {
      const involvesTeams =
        (teamsEqual(record.homeTeam, homeTeam) && teamsEqual(record.awayTeam, awayTeam)) ||
        (teamsEqual(record.homeTeam, awayTeam) && teamsEqual(record.awayTeam, homeTeam));
      if (!involvesTeams) {
        return false;
      }
      if (matchDate && record.matchDate >= matchDate) {
        return false;
      }
      return true;
    })
    .sort(
      (left, right) =>
        new Date(right.matchDate).getTime() - new Date(left.matchDate).getTime()
    );

  const matches: H2HMatchRecord[] = [];

  for (const record of candidates) {
    if (isFriendlyCompetition(record.league)) {
      stats.filteredFriendlyCount += 1;
      continue;
    }
    if (record.status !== "VERIFIED" || !record.result) {
      stats.filteredIncompleteCount += 1;
      continue;
    }
    const mapped = historicalRecordToH2HMatch(record);
    if (!mapped) {
      stats.filteredIncompleteCount += 1;
      continue;
    }
    matches.push(mapped);
    if (matches.length >= 5) {
      break;
    }
  }

  return { matches, stats };
}

export function normalizeApiH2HFixtures(
  fixtures: ApiFootballFixtureRecord[]
): { matches: H2HMatchRecord[]; stats: H2HNormalizationStats } {
  const stats: H2HNormalizationStats = {
    filteredFriendlyCount: 0,
    filteredIncompleteCount: 0,
    filteredStatusCount: 0,
  };
  const matches: H2HMatchRecord[] = [];

  for (const fixture of fixtures) {
    if (isFriendlyCompetition(fixture.league)) {
      stats.filteredFriendlyCount += 1;
      continue;
    }
    if (fixture.status && EXCLUDED_FIXTURE_STATUSES.has(fixture.status)) {
      stats.filteredStatusCount += 1;
      continue;
    }
    if (fixture.status && !COMPLETED_FIXTURE_STATUSES.has(fixture.status)) {
      stats.filteredStatusCount += 1;
      continue;
    }
    const mapped = apiFixtureToH2HMatch(fixture);
    if (!mapped) {
      stats.filteredIncompleteCount += 1;
      continue;
    }
    matches.push(mapped);
    if (matches.length >= 5) {
      break;
    }
  }

  return { matches, stats };
}
