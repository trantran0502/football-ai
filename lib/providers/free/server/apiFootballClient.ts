import {
  API_FOOTBALL_BASE_URL,
  getApiFootballKey,
} from "@/lib/providers/free/config";
import { incrementApiUsage } from "@/lib/providers/free/server/serverQuota";

export interface ApiFootballTeam {
  id: number;
  name: string;
  country: string | null;
}

export interface ApiFootballFixture {
  fixtureId: number;
  date: string;
  league: string | null;
  leagueId: number | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  status: string;
  homeGoals: number | null;
  awayGoals: number | null;
  halfTimeHome: number | null;
  halfTimeAway: number | null;
}

export interface ApiFootballStandingRow {
  rank: number;
  team: string;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface ApiFootballMatchStatistics {
  homeShotsOnGoal: number | null;
  awayShotsOnGoal: number | null;
  homeBallPossession: number | null;
  awayBallPossession: number | null;
  homeCorners: number | null;
  awayCorners: number | null;
  homeFouls: number | null;
  awayFouls: number | null;
}

async function apiFootballFetch<T>(path: string): Promise<T> {
  const apiKey = getApiFootballKey();
  if (!apiKey) {
    throw new Error("API_FOOTBALL_KEY is not configured.");
  }

  incrementApiUsage(1);

  const response = await fetch(`${API_FOOTBALL_BASE_URL}${path}`, {
    headers: {
      "x-apisports-key": apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`API-Football request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    response: T;
    errors?: Record<string, string>;
  };

  if (payload.errors && Object.keys(payload.errors).length > 0) {
    throw new Error(`API-Football error: ${JSON.stringify(payload.errors)}`);
  }

  return payload.response;
}

function mapFixture(item: Record<string, unknown>): ApiFootballFixture {
  const fixture = item.fixture as Record<string, unknown>;
  const league = item.league as Record<string, unknown>;
  const teams = item.teams as Record<string, Record<string, unknown>>;
  const goals = item.goals as Record<string, number | null>;
  const score = item.score as Record<string, Record<string, number | null>>;

  return {
    fixtureId: fixture.id as number,
    date: (fixture.date as string).split("T")[0],
    league: (league.name as string) ?? null,
    leagueId: (league.id as number) ?? null,
    homeTeam: teams.home.name as string,
    awayTeam: teams.away.name as string,
    homeTeamId: teams.home.id as number,
    awayTeamId: teams.away.id as number,
    status: (fixture.status as Record<string, string>).short,
    homeGoals: goals.home ?? null,
    awayGoals: goals.away ?? null,
    halfTimeHome: score.halftime?.home ?? null,
    halfTimeAway: score.halftime?.away ?? null,
  };
}

export async function searchTeam(teamName: string): Promise<ApiFootballTeam | null> {
  const response = await apiFootballFetch<Array<Record<string, unknown>>>(
    `/teams?search=${encodeURIComponent(teamName)}`
  );

  if (!response.length) {
    return null;
  }

  const exact = response.find((item) => {
    const team = item.team as Record<string, unknown>;
    return (
      String(team.name).toLowerCase() === teamName.toLowerCase() ||
      String(team.name).toLowerCase().includes(teamName.toLowerCase())
    );
  });

  const selected = exact ?? response[0];
  const team = selected.team as Record<string, unknown>;

  return {
    id: team.id as number,
    name: team.name as string,
    country: (team.country as string) ?? null,
  };
}

export async function getTeamRecentFixtures(
  teamId: number,
  last = 10,
  venue?: "home" | "away"
): Promise<ApiFootballFixture[]> {
  const venueQuery = venue ? `&venue=${venue}` : "";
  const response = await apiFootballFetch<Array<Record<string, unknown>>>(
    `/fixtures?team=${teamId}&last=${last}${venueQuery}`
  );

  return response
    .map(mapFixture)
    .filter((item) => item.homeGoals !== null && item.awayGoals !== null);
}

export async function getHeadToHeadFixtures(
  homeTeamId: number,
  awayTeamId: number,
  last = 10
): Promise<ApiFootballFixture[]> {
  const response = await apiFootballFetch<Array<Record<string, unknown>>>(
    `/fixtures?h2h=${homeTeamId}-${awayTeamId}&last=${last}`
  );

  return response
    .map(mapFixture)
    .filter((item) => item.homeGoals !== null && item.awayGoals !== null);
}

export async function findFixtureOnDate(
  homeTeamId: number,
  awayTeamId: number,
  matchDate?: string
): Promise<ApiFootballFixture | null> {
  if (!matchDate) {
    const h2h = await getHeadToHeadFixtures(homeTeamId, awayTeamId, 1);
    return h2h[0] ?? null;
  }

  const response = await apiFootballFetch<Array<Record<string, unknown>>>(
    `/fixtures?date=${matchDate}&team=${homeTeamId}`
  );

  const fixtures = response.map(mapFixture);
  const matched = fixtures.find(
    (item) =>
      item.awayTeamId === awayTeamId ||
      item.homeTeamId === awayTeamId
  );

  return matched ?? fixtures[0] ?? null;
}

export async function getStandings(
  leagueId: number,
  season: number
): Promise<ApiFootballStandingRow[]> {
  const response = await apiFootballFetch<Array<Record<string, unknown>>>(
    `/standings?league=${leagueId}&season=${season}`
  );

  const first = response[0]?.league as Record<string, unknown> | undefined;
  const table = (first?.standings as Array<Array<Record<string, unknown>>>)?.[0];
  if (!table) {
    return [];
  }

  return table.map((row) => {
    const all = row.all as Record<string, unknown>;
    const goals = all.goals as Record<string, number>;
    const team = row.team as Record<string, string>;
    return {
      rank: row.rank as number,
      team: team.name,
      played: all.played as number,
      won: all.win as number,
      draw: all.draw as number,
      lost: all.lose as number,
      goalsFor: goals.for,
      goalsAgainst: goals.against,
      points: row.points as number,
    };
  });
}

export async function getFixtureStatistics(
  fixtureId: number
): Promise<ApiFootballMatchStatistics | null> {
  const response = await apiFootballFetch<Array<Record<string, unknown>>>(
    `/fixtures/statistics?fixture=${fixtureId}`
  );

  if (!response.length) {
    return null;
  }

  const homeStats = response[0].statistics as Array<Record<string, unknown>>;
  const awayStats = response[1]?.statistics as Array<Record<string, unknown>> | undefined;

  const readStat = (
    stats: Array<Record<string, unknown>> | undefined,
    type: string
  ): number | null => {
    const found = stats?.find((item) => item.type === type);
    if (!found) {
      return null;
    }
    const value = found.value;
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value.replace("%", ""));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  return {
    homeShotsOnGoal: readStat(homeStats, "Shots on Goal"),
    awayShotsOnGoal: readStat(awayStats, "Shots on Goal"),
    homeBallPossession: readStat(homeStats, "Ball Possession"),
    awayBallPossession: readStat(awayStats, "Ball Possession"),
    homeCorners: readStat(homeStats, "Corner Kicks"),
    awayCorners: readStat(awayStats, "Corner Kicks"),
    homeFouls: readStat(homeStats, "Fouls"),
    awayFouls: readStat(awayStats, "Fouls"),
  };
}
