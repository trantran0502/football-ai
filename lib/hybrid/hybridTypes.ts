export type HybridOriginSource =
  | "supabase"
  | "apiFootball"
  | "googleSearch"
  | "hybrid";

export type HybridCompetitionType = "league" | "cup" | "friendly" | "other";

export type HybridVenueSide = "home" | "away" | "neutral";

export type HybridFormLabel = "last10Official" | "last5Home" | "last5Away";

export interface HybridCitation {
  url: string;
  title?: string;
  snippet?: string;
}

export interface HybridConflict {
  field: string;
  message: string;
  sources: HybridOriginSource[];
  apiValue?: unknown;
  googleValue?: unknown;
}

export interface HybridSourceValue<T> {
  value: T;
  source: Exclude<HybridOriginSource, "hybrid" | "supabase">;
  fetchedAt: string;
  confidence: number;
  citations: HybridCitation[];
  query?: string;
}

export interface HybridField<T> {
  value: T | null;
  source: HybridOriginSource;
  fetchedAt: string;
  confidence: number;
  citations: HybridCitation[];
  conflicts: HybridConflict[];
}

export interface HybridMatchRecord {
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number | null;
  awayGoals: number | null;
  competition: string;
  competitionType: HybridCompetitionType;
  venue: HybridVenueSide;
  neutralVenue: boolean;
  includesExtraTime: boolean;
  includesPenalties: boolean;
}

export interface HybridFormSample {
  label: HybridFormLabel;
  matches: HybridMatchRecord[];
  includesFriendlies: boolean;
  includesExtraTime: boolean;
  includesPenalties: boolean;
}

export interface HybridStandingRecord {
  teamName: string;
  rank: number | null;
  played: number | null;
  points: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
}

export interface HybridInjuryRecord {
  teamName: string;
  playerName: string;
  reason: string;
  status: string;
}

export interface HybridTeamMetrics {
  goalsFor: number | null;
  goalsAgainst: number | null;
  xg: number | null;
  xga: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  possession: number | null;
  cleanSheets: number | null;
  failedToScore: number | null;
}

export interface HybridMatchStatusContext {
  importance: string | null;
  mustWin: boolean | null;
  alreadyQualified: boolean | null;
  alreadyEliminated: boolean | null;
  weather: string | null;
  longTravelAway: boolean | null;
  congestedSchedule: boolean | null;
  coachNews: string | null;
  officialNews: string | null;
  rotation: string | null;
}

export interface HybridSourcePayload {
  source: Exclude<HybridOriginSource, "hybrid" | "supabase">;
  fetchedAt: string;
  confidence: number;
  citations: HybridCitation[];
  queries: string[];
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
  recentFormLast10Official: HybridMatchRecord[];
  recentFormLast5Home: HybridMatchRecord[];
  recentFormLast5Away: HybridMatchRecord[];
  includesFriendlies: boolean;
  includesExtraTime: boolean;
  includesPenalties: boolean;
  h2hLast5Official: HybridMatchRecord[];
  standings: HybridStandingRecord[];
  injuries: HybridInjuryRecord[];
  suspensions: HybridInjuryRecord[];
  homeMetrics: HybridTeamMetrics | null;
  awayMetrics: HybridTeamMetrics | null;
  matchStatus: HybridMatchStatusContext | null;
}

export interface NormalizedTeamContext {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
  resolvedAt: string;
  recentFormLast10Official: HybridField<HybridFormSample>;
  recentFormLast5Home: HybridField<HybridFormSample>;
  recentFormLast5Away: HybridField<HybridFormSample>;
  h2hLast5Official: HybridField<HybridMatchRecord[]>;
  standings: HybridField<HybridStandingRecord[]>;
  injuries: HybridField<HybridInjuryRecord[]>;
  homeMetrics: HybridField<HybridTeamMetrics>;
  awayMetrics: HybridField<HybridTeamMetrics>;
  matchStatus: HybridField<HybridMatchStatusContext>;
  warnings: string[];
}

export interface HybridResolveRequest {
  homeTeam: string;
  awayTeam: string;
  matchDate?: string;
  leagueName?: string;
}

export interface HybridResolveResult {
  context: NormalizedTeamContext;
  cacheHit: boolean;
  apiUsed: boolean;
  googleUsed: boolean;
}
