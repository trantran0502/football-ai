import type { ApiFootballFixtureRecord } from "@/lib/providers/apiFootball/apiFootballTypes";
import type { HistoricalMatchRecord } from "@/lib/database/matchSchema";
import {
  COMPLETED_MATCH_STATUSES,
  EXCLUDED_MATCH_STATUSES,
  type TeamProfileMatchInput,
} from "@/lib/teamProfile/teamProfileTypes";

const FRIENDLY_LEAGUE_PATTERN = /friend/i;

export function isFriendlyLeague(league: string | null | undefined): boolean {
  if (!league) {
    return false;
  }
  return FRIENDLY_LEAGUE_PATTERN.test(league);
}

export function isOfficialCompletedMatch(status: string): boolean {
  return COMPLETED_MATCH_STATUSES.has(status);
}

export function shouldExcludeMatch(input: {
  status: string;
  league: string | null;
}): boolean {
  if (EXCLUDED_MATCH_STATUSES.has(input.status)) {
    return true;
  }
  if (!isOfficialCompletedMatch(input.status)) {
    return true;
  }
  if (isFriendlyLeague(input.league)) {
    return true;
  }
  return false;
}

export function normalizeApiFootballFixtures(
  fixtures: ApiFootballFixtureRecord[]
): TeamProfileMatchInput[] {
  const normalized: TeamProfileMatchInput[] = [];

  for (const fixture of fixtures) {
    if (
      shouldExcludeMatch({ status: fixture.status, league: fixture.league }) ||
      fixture.homeGoals === null ||
      fixture.awayGoals === null
    ) {
      continue;
    }

    normalized.push({
      fixtureId: fixture.fixtureId,
      date: fixture.date,
      league: fixture.league,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      homeGoals: fixture.homeGoals,
      awayGoals: fixture.awayGoals,
      halfTimeHome: fixture.halfTimeHome,
      halfTimeAway: fixture.halfTimeAway,
      status: fixture.status,
    });
  }

  return sortMatchesDesc(normalized);
}

export function normalizeVerifiedMatchRecords(
  records: HistoricalMatchRecord[],
  perspectiveTeamId: number,
  perspectiveTeamName: string
): TeamProfileMatchInput[] {
  const normalized: TeamProfileMatchInput[] = [];

  for (const record of records) {
    if (record.status !== "VERIFIED" || !record.result) {
      continue;
    }
    if (isFriendlyLeague(record.league)) {
      continue;
    }

    const isHome =
      record.homeTeam.toLowerCase() === perspectiveTeamName.toLowerCase();
    const isAway =
      record.awayTeam.toLowerCase() === perspectiveTeamName.toLowerCase();
    if (!isHome && !isAway) {
      continue;
    }

    normalized.push({
      fixtureId: hashMatchKey(record.matchDate, record.homeTeam, record.awayTeam),
      date: record.matchDate,
      league: record.league,
      homeTeam: record.homeTeam,
      awayTeam: record.awayTeam,
      homeTeamId: isHome ? perspectiveTeamId : perspectiveTeamId + 1,
      awayTeamId: isAway ? perspectiveTeamId : perspectiveTeamId + 1,
      homeGoals: record.result.fullTimeHomeGoals,
      awayGoals: record.result.fullTimeAwayGoals,
      halfTimeHome: record.result.halfTimeHomeGoals,
      halfTimeAway: record.result.halfTimeAwayGoals,
      status: "FT",
    });
  }

  return sortMatchesDesc(normalized);
}

export function filterHomeMatches(
  matches: TeamProfileMatchInput[],
  teamId: number
): TeamProfileMatchInput[] {
  return matches.filter((match) => match.homeTeamId === teamId);
}

export function filterAwayMatches(
  matches: TeamProfileMatchInput[],
  teamId: number
): TeamProfileMatchInput[] {
  return matches.filter((match) => match.awayTeamId === teamId);
}

export function sortMatchesDesc(matches: TeamProfileMatchInput[]): TeamProfileMatchInput[] {
  return [...matches].sort((left, right) => right.date.localeCompare(left.date));
}

function hashMatchKey(matchDate: string, homeTeam: string, awayTeam: string): number {
  const raw = `${matchDate}:${homeTeam}:${awayTeam}`;
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return hash || 1;
}
