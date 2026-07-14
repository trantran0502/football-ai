export type ApiFootballCacheCategory =
  | "fixture"
  | "standings"
  | "teamStatistics"
  | "h2h"
  | "injuries"
  | "teamForm";

export const API_FOOTBALL_CACHE_TTL_MS: Record<ApiFootballCacheCategory, number> = {
  fixture: 6 * 60 * 60 * 1000,
  standings: 12 * 60 * 60 * 1000,
  teamStatistics: 24 * 60 * 60 * 1000,
  h2h: 24 * 60 * 60 * 1000,
  injuries: 2 * 60 * 60 * 1000,
  teamForm: 6 * 60 * 60 * 1000,
};

export interface ApiFootballTeamRef {
  id: number;
  name: string;
  country: string | null;
}

export interface ApiFootballFixtureRecord {
  fixtureId: number;
  date: string;
  league: string | null;
  leagueId: number | null;
  season: number | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  status: string;
  homeGoals: number | null;
  awayGoals: number | null;
  halfTimeHome: number | null;
  halfTimeAway: number | null;
  venue: string | null;
  neutralVenue: boolean;
}

export interface ApiFootballStandingRecord {
  rank: number;
  team: string;
  teamId: number;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface ApiFootballTeamStatisticsRecord {
  teamId: number;
  leagueId: number;
  season: number;
  form: string | null;
  fixturesPlayed: number | null;
  wins: number | null;
  draws: number | null;
  losses: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  cleanSheets: number | null;
  failedToScore: number | null;
  averageGoalsFor: number | null;
  averageGoalsAgainst: number | null;
  shotsTotal: number | null;
  shotsOnTarget: number | null;
  expectedGoals: number | null;
  expectedGoalsAgainst: number | null;
}

export interface ApiFootballInjuryRecord {
  teamId: number;
  playerName: string;
  type: string | null;
  reason: string | null;
}

export interface ApiFootballTeamFormRecord {
  teamId: number;
  fixtures: ApiFootballFixtureRecord[];
}

export interface ApiFootballMatchBundle {
  homeTeam: ApiFootballTeamRef;
  awayTeam: ApiFootballTeamRef;
  fixture: ApiFootballFixtureRecord | null;
  homeForm: ApiFootballTeamFormRecord;
  awayForm: ApiFootballTeamFormRecord;
  headToHead: ApiFootballFixtureRecord[];
  standings: ApiFootballStandingRecord[];
  homeStatistics: ApiFootballTeamStatisticsRecord | null;
  awayStatistics: ApiFootballTeamStatisticsRecord | null;
  injuries: ApiFootballInjuryRecord[];
}

export interface ApiFootballClientConfig {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  minRequestIntervalMs?: number;
}

export interface ApiFootballRawEnvelope<T> {
  response: T;
  errors?: Record<string, string> | string[] | null;
}

export interface ApiFootballCachedPayload<T> {
  data: T;
  fetchedAt: string;
  expiresAt: string;
  category: ApiFootballCacheCategory;
}
