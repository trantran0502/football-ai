export type TeamProfileSource =
  | "api-football"
  | "provider-cache"
  | "match-records"
  | "incomplete"
  | "refresh_failed";

export interface TeamProfileMatchInput {
  fixtureId: number;
  date: string;
  league: string | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number;
  awayGoals: number;
  halfTimeHome: number | null;
  halfTimeAway: number | null;
  status: string;
  shots?: number | null;
  shotsOnTarget?: number | null;
  possession?: number | null;
  xg?: number | null;
  xga?: number | null;
}

export interface TeamProfileAdvancedStatsInput {
  avgShots?: number | null;
  avgShotsOnTarget?: number | null;
  avgPossession?: number | null;
  avgXg?: number | null;
  avgXga?: number | null;
}

export interface TeamProfile {
  id?: string;
  teamId: number;
  teamName: string;
  leagueId: number | null;
  leagueName: string | null;
  season: number | null;
  sampleSize: number;
  recent10Wins: number | null;
  recent10Draws: number | null;
  recent10Losses: number | null;
  recent10PointsPerGame: number | null;
  recent10AvgGoals: number | null;
  recent10AvgConceded: number | null;
  home5Matches: number | null;
  home5WinRate: number | null;
  home5AvgGoals: number | null;
  home5AvgConceded: number | null;
  away5Matches: number | null;
  away5WinRate: number | null;
  away5AvgGoals: number | null;
  away5AvgConceded: number | null;
  bttsRate: number | null;
  over25Rate: number | null;
  over35Rate: number | null;
  under25Rate: number | null;
  cleanSheetRate: number | null;
  failedToScoreRate: number | null;
  avgShots: number | null;
  avgShotsOnTarget: number | null;
  avgPossession: number | null;
  avgXg: number | null;
  avgXga: number | null;
  formScore: number | null;
  momentumScore: number | null;
  source: TeamProfileSource;
  dataCompleteness: number;
  calculatedAt: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TeamProfileIdentity {
  teamId: number;
  teamName: string;
  leagueId: number | null;
  leagueName: string | null;
  season: number | null;
}

export interface RefreshTeamProfileInput extends TeamProfileIdentity {
  runDate?: string;
  allowApiFetch?: boolean;
}

export interface RefreshTeamProfileResult {
  profile: TeamProfile;
  completeness: number;
  warnings: string[];
  refreshed: boolean;
  skippedReason?: string;
}

export interface MatchTeamProfilesSnapshot {
  home: TeamProfile | null;
  away: TeamProfile | null;
  completeness: number;
  warnings: string[];
}

export interface EnsureTeamProfilesInput {
  runDate: string;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  leagueId: number | null;
  leagueName: string | null;
  season: number | null;
  allowApiFetch?: boolean;
}

export interface EnsureTeamProfilesResult {
  snapshot: MatchTeamProfilesSnapshot;
  profileWarnings: string[];
}

export const FORM_SCORE_DECAY = 0.92;

export const COMPLETED_MATCH_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

export const EXCLUDED_MATCH_STATUSES = new Set([
  "CANC",
  "ABD",
  "PST",
  "SUSP",
  "INT",
  "TBD",
  "NS",
  "1H",
  "HT",
  "2H",
  "ET",
  "BT",
  "P",
  "LIVE",
]);
