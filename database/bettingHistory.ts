/** 玩法類型 */
export type MarketType =
  | "moneyline"
  | "handicap"
  | "overUnder"
  | "btts"
  | "other";

/** 比賽資訊 */
export interface MatchInfo {
  /** 日期（ISO 8601 格式，例如 2026-07-14） */
  date: string;
  /** 聯賽 */
  league: string;
  /** 主隊 */
  homeTeam: string;
  /** 客隊 */
  awayTeam: string;
}

/** 盤口資訊 */
export interface OddsInfo {
  /** 玩法類型 */
  marketType: MarketType;
  /** 盤口（例如讓球線、大小球線） */
  line: string;
  /** 水位 */
  waterLevel: number;
  /** 賠率 */
  odds: number;
}

/** 分析資訊 */
export interface AnalysisInfo {
  /** 當時推薦選項 */
  recommendation: {
    market: string;
    selection: string;
    odds: number;
  };
  /** 評分（0-100） */
  score: number;
}

/** 比賽結果 */
export interface MatchOutcome {
  /** 是否過盤 */
  isWin: boolean;
  /** 實際結果 */
  actualResult: string;
  /** 盈虧（正數為盈利，負數為虧損） */
  profitLoss: number;
}

/** 原因紀錄 */
export interface ReasonRecord {
  /** 為什麼過盤 */
  winReason: string;
  /** 為什麼沒過盤 */
  lossReason: string;
}

/** 歷史盤口資料 */
export interface BettingHistory {
  /** 唯一識別碼 */
  id: string;
  /** 比賽資訊 */
  match: MatchInfo;
  /** 盤口資訊 */
  odds: OddsInfo;
  /** 分析資訊 */
  analysis: AnalysisInfo;
  /** 比賽結果 */
  outcome: MatchOutcome;
  /** 原因紀錄 */
  reasons: ReasonRecord;
  /** 紀錄建立時間 */
  createdAt: string;
}
