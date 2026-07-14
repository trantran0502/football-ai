/** 免費版足球資料模式 */
export type FootballDataMode = "free";

/** 資料來源 */
export type FreeDataSource = "api-football" | "football-data.org" | "calculated" | "cache";

export const UNAVAILABLE_FREE_LABEL = "免費資料源未提供";

/** 免費版不提供、必須保持 null 的欄位 */
export const PREMIUM_UNAVAILABLE_FIELDS = [
  "xG",
  "xGA",
  "injuries",
  "suspensions",
  "rotationInfo",
  "asianOddsHistory",
] as const;

export type PremiumUnavailableField = (typeof PREMIUM_UNAVAILABLE_FIELDS)[number];

export interface TeamDataRequest {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
  league?: string;
}

export interface FixtureInfo {
  fixtureId: number | null;
  league: string | null;
  leagueId: number | null;
  date: string | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: number | null;
  awayTeamId: number | null;
  status: string | null;
}

export interface FinalScore {
  home: number;
  away: number;
  halfTimeHome: number | null;
  halfTimeAway: number | null;
}

export interface StandingRow {
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

export interface RecentMatchSummary {
  fixtureId: number;
  date: string;
  league: string | null;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  halfTimeHome: number | null;
  halfTimeAway: number | null;
  isHome: boolean;
}

export interface TeamRecentForm {
  sampleSize: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  avgGoalsFor: number | null;
  avgGoalsAgainst: number | null;
  bttsRate: number | null;
  over25Rate: number | null;
  scoredRate: number | null;
  firstHalfGoalRate: number | null;
}

export interface BasicMatchStatistics {
  homeShotsOnGoal: number | null;
  awayShotsOnGoal: number | null;
  homeBallPossession: number | null;
  awayBallPossession: number | null;
  homeCorners: number | null;
  awayCorners: number | null;
  homeFouls: number | null;
  awayFouls: number | null;
}

export interface PremiumUnavailableData {
  xG: null;
  xGA: null;
  injuries: null;
  suspensions: null;
  rotationInfo: null;
  asianOddsHistory: null;
}

export interface ApiUsageInfo {
  date: string;
  used: number;
  limit: number;
  remaining: number;
  quotaExceeded: boolean;
}

export interface DataCompleteness {
  percent: number;
  available: number;
  total: number;
  missing: string[];
}

export interface TeamDataPackage {
  mode: FootballDataMode;
  fetchedAt: string;
  sources: FreeDataSource[];
  fixture: FixtureInfo;
  finalScore: FinalScore | null;
  standings: StandingRow[] | null;
  homeRecentMatches: RecentMatchSummary[];
  awayRecentMatches: RecentMatchSummary[];
  headToHead: RecentMatchSummary[];
  homeRecentForm: TeamRecentForm | null;
  awayRecentForm: TeamRecentForm | null;
  homeHomeForm: TeamRecentForm | null;
  awayAwayForm: TeamRecentForm | null;
  matchStatistics: BasicMatchStatistics | null;
  premium: PremiumUnavailableData;
  unavailableFields: string[];
  completeness: DataCompleteness;
  usage: ApiUsageInfo;
  errors: string[];
}

export interface TeamDataResponse {
  ok: boolean;
  data: TeamDataPackage | null;
  fromCache: boolean;
  message?: string;
}
