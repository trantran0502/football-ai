import type { LeagueStrengthSnapshot } from "@/lib/analysis/featureScore/providers/leagueStrengthProvider";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  isFormalCompletedFixture,
  isFriendlyCompetition,
} from "@/lib/providers/h2h/h2hNormalizer";

export interface LeagueStrengthMatchRecord {
  matchDate: string;
  league: string;
  homeGoals: number;
  awayGoals: number;
}

export interface LeagueStrengthNormalizationStats {
  filteredFriendlyCount: number;
  filteredIncompleteCount: number;
  filteredStatusCount: number;
  filteredLeagueMismatchCount: number;
}

function roundRate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizeStrength(value: number, max: number): number {
  return roundRate(Math.min(1, Math.max(0, value / max)));
}

export function normalizeLeagueName(value: string): string {
  return value.trim().toLowerCase();
}

export function leagueNamesMatch(
  requestLeague: string,
  recordLeague: string
): boolean {
  const left = normalizeLeagueName(requestLeague);
  const right = normalizeLeagueName(recordLeague);
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  return left.includes(right) || right.includes(left);
}

export function historicalRecordToLeagueMatch(
  record: HistoricalMatchRecord
): LeagueStrengthMatchRecord | null {
  if (record.status !== "VERIFIED" || !record.result) {
    return null;
  }

  const homeGoals = record.result.fullTimeHomeGoals;
  const awayGoals = record.result.fullTimeAwayGoals;
  if (
    !isFormalCompletedFixture({
      homeGoals,
      awayGoals,
      competition: record.league,
    })
  ) {
    return null;
  }

  return {
    matchDate: record.matchDate,
    league: record.league,
    homeGoals,
    awayGoals,
  };
}

export function findLeagueMatchRecordsFromHistory(
  records: HistoricalMatchRecord[],
  leagueName: string
): {
  matches: LeagueStrengthMatchRecord[];
  stats: LeagueStrengthNormalizationStats;
} {
  const stats: LeagueStrengthNormalizationStats = {
    filteredFriendlyCount: 0,
    filteredIncompleteCount: 0,
    filteredStatusCount: 0,
    filteredLeagueMismatchCount: 0,
  };
  const matches: LeagueStrengthMatchRecord[] = [];

  for (const record of records) {
    if (record.status !== "VERIFIED") {
      stats.filteredStatusCount += 1;
      continue;
    }
    if (isFriendlyCompetition(record.league)) {
      stats.filteredFriendlyCount += 1;
      continue;
    }
    if (!leagueNamesMatch(leagueName, record.league)) {
      stats.filteredLeagueMismatchCount += 1;
      continue;
    }

    const normalized = historicalRecordToLeagueMatch(record);
    if (!normalized) {
      stats.filteredIncompleteCount += 1;
      continue;
    }
    matches.push(normalized);
  }

  matches.sort((left, right) => right.matchDate.localeCompare(left.matchDate));

  return { matches, stats };
}

function computeDataFreshnessDays(
  newestMatchDate: string | null,
  referenceDate: string
): number | null {
  if (!newestMatchDate) {
    return null;
  }
  const reference = new Date(`${referenceDate}T00:00:00Z`);
  const newest = new Date(`${newestMatchDate}T00:00:00Z`);
  if (Number.isNaN(reference.getTime()) || Number.isNaN(newest.getTime())) {
    return null;
  }
  const diffMs = reference.getTime() - newest.getTime();
  return Math.max(0, Math.round(diffMs / (24 * 60 * 60 * 1000)));
}

export function buildLeagueStrengthSnapshotFromMatches(input: {
  leagueName: string;
  matches: LeagueStrengthMatchRecord[];
  referenceDate: string;
}): LeagueStrengthSnapshot {
  const sampleSize = input.matches.length;
  if (sampleSize === 0) {
    return {
      leagueName: input.leagueName,
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

  let totalGoals = 0;
  let newestMatchDate: string | null = null;
  for (const match of input.matches) {
    totalGoals += match.homeGoals + match.awayGoals;
    if (!newestMatchDate || match.matchDate > newestMatchDate) {
      newestMatchDate = match.matchDate;
    }
  }

  const teamPerformances = sampleSize * 2;
  const averageGoals = totalGoals / teamPerformances;
  const averageGoalsConceded = averageGoals;

  return {
    leagueName: input.leagueName,
    leagueRanking: null,
    leagueTier: null,
    attackStrength: normalizeStrength(averageGoals, 3),
    defenseStrength: normalizeStrength(3 - averageGoalsConceded, 3),
    averageGoals: roundRate(averageGoals),
    averageGoalsConceded: roundRate(averageGoalsConceded),
    sampleSize,
    dataFreshnessDays: computeDataFreshnessDays(
      newestMatchDate,
      input.referenceDate
    ),
  };
}
