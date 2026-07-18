import type { MatchResult } from "@/lib/database/matchSchema";
import type { MarketSelection } from "@/types/match";

/** Provider 識別（未來可擴充） */
export type ProviderId =
  | "mock"
  | "odds"
  | "flashscore"
  | "sofascore"
  | "bet365"
  | "api-football"
  | "the-odds-api"
  | (string & {});

/** 比賽識別 */
export type ProviderMatchId = string;

/** 比賽狀態 */
export type MatchStatus =
  | "scheduled"
  | "live"
  | "finished"
  | "postponed"
  | "cancelled";

/** 即將開賽比賽查詢 */
export interface UpcomingMatchesQuery {
  league?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

/** 賠率查詢 */
export interface OddsQuery {
  matchId?: ProviderMatchId;
  fixtureId?: number;
  date?: string;
  leagueId?: number;
  season?: number;
  bookmakerId?: string;
}

/** 賽果查詢 */
export interface ResultQuery {
  matchId: ProviderMatchId;
}

/** 歷史比賽查詢 */
export interface HistoricalMatchesQuery {
  league?: string;
  fromDate?: string;
  toDate?: string;
  homeTeam?: string;
  awayTeam?: string;
  limit?: number;
}

/** 即將開賽比賽 */
export interface UpcomingMatch {
  id: ProviderMatchId;
  date: string;
  kickoffTime?: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  status: MatchStatus;
  source: ProviderId;
}

/** 單場賠率資料 */
export interface OddsData {
  matchId: ProviderMatchId;
  fixtureId?: number;
  date: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  marketSelections: MarketSelection[];
  capturedAt: string;
  source: ProviderId;
  bookmakerId?: string;
}

/**
 * 賠率 Provider 抽象介面。
 * 所有賠率來源（Mock、API-Football、The Odds API 等）統一透過 OddsQuery 查詢並回傳 OddsData[]。
 */
export interface OddsProvider {
  fetchOdds(query: OddsQuery): Promise<OddsData[]>;
}

/** 單場賽果資料 */
export interface ResultData {
  matchId: ProviderMatchId;
  date: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  result: MatchResult;
  status: MatchStatus;
  source: ProviderId;
}

/** Provider 歷史比賽紀錄 */
export interface ProviderHistoricalMatch {
  id: ProviderMatchId;
  date: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  marketSelections: MarketSelection[];
  result: MatchResult;
  source: ProviderId;
}

/** Provider 建立選項（預留給未來 API key / endpoint 設定） */
export interface ProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/** Provider Factory 支援的類型 */
export type ProviderType =
  | "mock"
  | "odds"
  | "flashscore"
  | "sofascore"
  | "bet365"
  | "api-football"
  | "the-odds-api";

/**
 * 足球資料 Provider 抽象介面。
 * Analysis Engine 與上層模組只能透過此介面取得資料，不得直接呼叫外部 API。
 */
export interface FootballDataProvider {
  readonly id: ProviderId;
  readonly name: string;

  getUpcomingMatches(
    query?: UpcomingMatchesQuery
  ): Promise<UpcomingMatch[]>;

  getOdds(query: OddsQuery): Promise<OddsData | null>;

  getResult(query: ResultQuery): Promise<ResultData | null>;

  getHistoricalMatches(
    query?: HistoricalMatchesQuery
  ): Promise<ProviderHistoricalMatch[]>;
}

export type ProviderConstructor = new (
  options?: ProviderOptions
) => FootballDataProvider;
