/**
 * Football Knowledge Base — 共用型別與介面。
 * 僅定義盤口知識結構，不含分析邏輯。
 */

/** 勝負／強度等級 */
export type KnowledgeStrength = "low" | "medium" | "high";

/** 信心等級 */
export type KnowledgeConfidence = "low" | "medium" | "high";

/** 看好一方 */
export type FavoriteSide = "home" | "away" | "draw";

/** 大小球偏向 */
export type OverBias = "over" | "under" | "neutral";

/** 比賽節奏預期 */
export type ExpectedTempo = "slow" | "moderate" | "fast";

/** 零封預期程度 */
export type CleanSheetExpectation = "unlikely" | "possible" | "likely";

/**
 * 亞洲讓分盤線 token。
 * 涵蓋常見整數、半球、以及 ±50 水差變體。
 */
export type HandicapLineToken =
  | "0"
  | "0-50"
  | "0+50"
  | "0.5"
  | "1"
  | "1-50"
  | "1+50"
  | "1.5"
  | (string & {});

/** 單一讓分盤線輸入 */
export interface HandicapLineInput {
  line: HandicapLineToken;
  homeOdds: number;
  awayOdds: number;
}

/** 預期進球區間 */
export interface ExpectedGoalRange {
  min: number;
  max: number;
}

// ---------------------------------------------------------------------------
// Moneyline
// ---------------------------------------------------------------------------

/** Moneyline 輸入：主勝、和局、客勝賠率 */
export interface MoneylineOddsInput {
  /** 主勝 decimal odds */
  homeWin: number;
  /** 和局 decimal odds */
  draw: number;
  /** 客勝 decimal odds */
  awayWin: number;
}

/** Moneyline 知識輸出 */
export interface MoneylineKnowledgeResult {
  favoriteSide: FavoriteSide;
  favoriteStrength: KnowledgeStrength;
  impliedHomeProbability: number;
  impliedDrawProbability: number;
  impliedAwayProbability: number;
}

// ---------------------------------------------------------------------------
// Handicap
// ---------------------------------------------------------------------------

/** Handicap 輸入：所有讓分盤線 */
export interface HandicapKnowledgeInput {
  lines: HandicapLineInput[];
}

/** Handicap 知識輸出 */
export interface HandicapKnowledgeResult {
  expectedWinningMargin: number;
  handicapStrength: KnowledgeStrength;
  favoriteSide: Exclude<FavoriteSide, "draw">;
  confidence: KnowledgeConfidence;
}

// ---------------------------------------------------------------------------
// Total Goals
// ---------------------------------------------------------------------------

/** 單一大小球盤線輸入 */
export interface TotalGoalsLineInput {
  line: number;
  overOdds: number;
  underOdds: number;
}

/** Total Goals 輸入 */
export interface TotalGoalsKnowledgeInput {
  lines: TotalGoalsLineInput[];
}

/** Total Goals 知識輸出 */
export interface TotalGoalsKnowledgeResult {
  expectedGoalRange: ExpectedGoalRange;
  expectedTempo: ExpectedTempo;
  overBias: OverBias;
  confidence: KnowledgeConfidence;
}

// ---------------------------------------------------------------------------
// BTTS
// ---------------------------------------------------------------------------

/** BTTS 輸入 */
export interface BttsKnowledgeInput {
  yesOdds: number;
  noOdds: number;
}

/** BTTS 知識輸出 */
export interface BttsKnowledgeResult {
  bothTeamsLikely: boolean;
  cleanSheetExpectation: CleanSheetExpectation;
  confidence: KnowledgeConfidence;
}
