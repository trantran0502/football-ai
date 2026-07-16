/** 亞洲盤 Rules Engine 型別 */
export type {
  AsianModifier,
  AsianLine,
  SettlementAtBoundary,
  HandicapAnchorSide,
} from "@/lib/parser/asianRules";

export type { AsianMarketLine, AsianMarketSide } from "@/lib/parser/asianLine";

import type {
  AsianModifier,
  SettlementAtBoundary,
} from "@/lib/parser/asianRules";

/** 投注市場分類 */
export type MarketType =
  | "moneyline"
  | "handicap"
  | "totalGoals"
  | "teamGoals"
  | "btts"
  | "oddEven"
  | "corners"
  | "cards"
  | "correctScore"
  | "halfTimeFullTime"
  | "doubleChance"
  | "firstGoal"
  | "lastGoal"
  | "special";

export type MarketPeriod = "full" | "half" | "segment";

export type MarketFamily =
  | "asianHandicap"
  | "asianOverUnder"
  | "moneyline"
  | "btts"
  | "oddEven"
  | "correctScore"
  | "halfTimeFullTime"
  | "doubleChance"
  | "special"
  | "generic";

export type MarketSide =
  | "home"
  | "away"
  | "draw"
  | "over"
  | "under"
  | "yes"
  | "no"
  | "odd"
  | "even"
  | "homeOrDraw"
  | "drawOrAway"
  | "homeOrAway"
  | "none";

/** 全場 / 半場（BettingSelection 相容） */
export type BetPeriod = "full" | "half";

/** @deprecated 使用 MarketSide */
export type BetSide =
  | "home"
  | "away"
  | "over"
  | "under"
  | "draw"
  | "yes"
  | "no"
  | "odd"
  | "even";

/** 統一下注選項（Rules Engine 標準輸出） */
export interface MarketSelection {
  marketType: MarketType;
  marketFamily: MarketFamily;
  title: string;
  period: MarketPeriod;
  side: MarketSide;
  /** 顯示標籤（波膽、半全場、雙勝彩等） */
  label?: string | null;
  rawLine: string | null;
  line: number | null;
  modifier: AsianModifier | null;
  handicap?: number | null;
  odds: number;
  /** 邊界結算規則（Normalizer 填入） */
  boundarySettlement?: SettlementAtBoundary;
  /** 隱含勝率（Normalizer 填入） */
  impliedProbability?: number;
}

/** 單一下注選項（UI / 分析相容投影） */
export interface BettingSelection {
  marketType: MarketType;
  title: string;
  period: BetPeriod;
  side: BetSide;
  line: number;
  water: string | null;
  odds: number;
}

/** 亞洲讓分盤口（相容舊欄位） */
export interface HandicapMarket {
  raw: string;
  line: number;
  water: string | null;
  home: string;
  away: string;
}

/** 大小球盤口（相容舊欄位） */
export interface OverUnderMarket {
  raw: string;
  line: number;
  water: string | null;
  over: string;
  under: string;
}

export interface OddEvenMarket {
  odd: string;
  even: string;
}

export interface BttsMarket {
  yes: string;
  no: string;
}

export interface OtherMarket {
  name: string;
  raw: string;
  line: number;
  water: string | null;
  selections: Array<{ label: string; odds: string }>;
}

export interface UnknownMarket {
  name: string;
  raw: string;
  count: number;
  examples: string[];
}

export interface MatchData {
  league: string;
  leagueId?: number | null;
  season?: number | null;
  fixtureId?: number | null;
  kickoffTime?: string | null;
  homeTeam: string;
  awayTeam: string;
  homeTeamId?: number | null;
  awayTeamId?: number | null;
  /** Rules Engine 標準下注選項 */
  marketSelections: MarketSelection[];
  /** UI / 分析相容投影 */
  selections: BettingSelection[];
  unknownMarkets: UnknownMarket[];
  /** @deprecated 由 selections 同步 */
  moneyline: string[];
  handicap: HandicapMarket[];
  overUnder: OverUnderMarket[];
  btts: BttsMarket[];
  oddEven: OddEvenMarket[];
  otherMarkets: OtherMarket[];
}
