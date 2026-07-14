/** 主客場統計數據 */
export interface HomeAwayStats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsScored: number;
  goalsConceded: number;
}

/** 最近 10 場戰績（W=勝, D=和, L=負） */
export type RecentForm = ("W" | "D" | "L")[];

/** 球隊統計資料 */
export interface TeamStats {
  /** 最近 10 場戰績 */
  recent10Results: RecentForm;
  /** 進球 */
  goalsScored: number;
  /** 失球 */
  goalsConceded: number;
  /** 主客場數據 */
  homeAway: {
    home: HomeAwayStats;
    away: HomeAwayStats;
  };
  /** Expected Goals */
  xG: number;
  /** Expected Goals Against */
  xGA: number;
  /** BTTS 命中率（0-1） */
  bttsRate: number;
  /** 大小球命中率（0-1） */
  overUnderRate: number;
  /** 上半場進球率（0-1） */
  firstHalfGoalRate: number;
}

/** 盤口賠率選項 */
export interface OddsOption {
  label: string;
  odds: number;
}

/** 亞洲讓分盤 */
export interface AsianHandicapMarket {
  line: string;
  home: OddsOption;
  away: OddsOption;
}

/** 大小球盤 */
export interface OverUnderMarket {
  line: string;
  over: OddsOption;
  under: OddsOption;
}

/** BTTS 盤 */
export interface BttsMarket {
  yes: OddsOption;
  no: OddsOption;
}

/** 盤口資料 */
export interface MarketData {
  /** 開盤 */
  opening: {
    moneyline: OddsOption[];
    asianHandicap: AsianHandicapMarket[];
    overUnder: OverUnderMarket[];
    btts: BttsMarket | null;
  };
  /** 即時盤 */
  live: {
    moneyline: OddsOption[];
    asianHandicap: AsianHandicapMarket[];
    overUnder: OverUnderMarket[];
    btts: BttsMarket | null;
  };
  /** 當前主要賠率（通常對應即時盤） */
  odds: OddsOption[];
  /** 亞洲盤 */
  asianHandicap: AsianHandicapMarket[];
  /** 大小球 */
  overUnder: OverUnderMarket[];
  /** BTTS */
  btts: BttsMarket | null;
}

/** 風險等級 */
export type RiskLevel = "low" | "medium" | "high";

/** 分析結果 */
export interface AnalysisResult {
  /** 推薦選項 */
  recommendation: {
    market: string;
    selection: string;
    odds: number;
  };
  /** 評分（0-100） */
  score: number;
  /** 原因 */
  reason: string;
  /** 風險 */
  risk: {
    level: RiskLevel;
    description: string;
  };
}

/** 完整分析資料（球隊 + 盤口 + 結果） */
export interface FullAnalysis {
  homeTeam: TeamStats;
  awayTeam: TeamStats;
  market: MarketData;
  result: AnalysisResult;
}
