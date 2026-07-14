import {
  FOOTBALL_DATA_ORG_BASE_URL,
  getFootballDataOrgKey,
} from "@/lib/providers/free/config";
import { incrementApiUsage } from "@/lib/providers/free/server/serverQuota";
import type { ApiFootballFixture } from "@/lib/providers/free/server/apiFootballClient";

export interface FootballDataOrgStandingRow {
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

async function footballDataOrgFetch<T>(path: string): Promise<T> {
  const token = getFootballDataOrgKey();
  if (!token) {
    throw new Error("FOOTBALL_DATA_ORG_KEY is not configured.");
  }

  incrementApiUsage(1);

  const response = await fetch(`${FOOTBALL_DATA_ORG_BASE_URL}${path}`, {
    headers: {
      "X-Auth-Token": token,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`football-data.org request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function searchTeamId(teamName: string): Promise<number | null> {
  const payload = await footballDataOrgFetch<{
    teams: Array<{ id: number; name: string }>;
  }>(`/teams?name=${encodeURIComponent(teamName)}`);

  const match = payload.teams.find((team) =>
    team.name.toLowerCase().includes(teamName.toLowerCase())
  );

  return match?.id ?? payload.teams[0]?.id ?? null;
}

export async function getTeamFinishedMatches(
  teamId: number,
  limit = 10
): Promise<ApiFootballFixture[]> {
  const payload = await footballDataOrgFetch<{
    matches: Array<{
      id: number;
      utcDate: string;
      status: string;
      homeTeam: { id: number; name: string };
      awayTeam: { id: number; name: string };
      score: {
        fullTime: { home: number | null; away: number | null };
        halfTime: { home: number | null; away: number | null };
      };
      competition?: { name?: string };
    }>;
  }>(`/teams/${teamId}/matches?status=FINISHED&limit=${limit}`);

  return payload.matches
    .filter(
      (match) =>
        match.score.fullTime.home !== null && match.score.fullTime.away !== null
    )
    .map((match) => ({
      fixtureId: match.id,
      date: match.utcDate.split("T")[0],
      league: match.competition?.name ?? null,
      leagueId: null,
      homeTeam: match.homeTeam.name,
      awayTeam: match.awayTeam.name,
      homeTeamId: match.homeTeam.id,
      awayTeamId: match.awayTeam.id,
      status: match.status,
      homeGoals: match.score.fullTime.home,
      awayGoals: match.score.fullTime.away,
      halfTimeHome: match.score.halfTime.home,
      halfTimeAway: match.score.halfTime.away,
    }));
}

export async function getCompetitionStandings(
  competitionCode: string
): Promise<FootballDataOrgStandingRow[]> {
  const payload = await footballDataOrgFetch<{
    standings: Array<
      Array<{
        position: number;
        team: { name: string };
        playedGames: number;
        won: number;
        draw: number;
        lost: number;
        goalsFor: number;
        goalsAgainst: number;
        points: number;
      }>
    >;
  }>(`/competitions/${competitionCode}/standings`);

  const table = payload.standings[0] ?? [];

  return table.map((row) => ({
    rank: row.position,
    team: row.team.name,
    played: row.playedGames,
    won: row.won,
    draw: row.draw,
    lost: row.lost,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    points: row.points,
  }));
}
