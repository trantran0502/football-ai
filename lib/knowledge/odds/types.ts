/**
 * Odds Knowledge Engine — 共用型別。
 * 僅定義賠率轉換與市場正規化結構，不含分析規則。
 */

/** 支援的賠率平台識別（可透過 registerPlatformConverter 擴充） */
export type OddsPlatform =
  | "decimal"
  | "hongkong"
  | "malay"
  | "indonesian"
  | "american"
  | (string & {});

/** 平台原始賠率輸入 */
export interface PlatformOddsInput {
  platform: OddsPlatform;
  value: number;
}

/** 標準 Decimal Odds */
export interface DecimalOdds {
  decimal: number;
}

/** 隱含機率（0–1） */
export type ImpliedProbability = number;

/** 正規化市場種類 */
export type NormalizedMarketKind = "moneyline" | "handicap" | "overUnder" | "btts";

/** 正規化選項 */
export interface NormalizedSelection {
  side: string;
  decimalOdds: number;
  impliedProbability: ImpliedProbability;
  line: number | null;
  rawLine: string | null;
}

/** 正規化市場輸出 */
export interface NormalizedMarket {
  kind: NormalizedMarketKind;
  selections: NormalizedSelection[];
}

// ---------------------------------------------------------------------------
// Market inputs
// ---------------------------------------------------------------------------

export interface MoneylineMarketInput {
  kind: "moneyline";
  home: PlatformOddsInput;
  draw: PlatformOddsInput;
  away: PlatformOddsInput;
}

export interface HandicapMarketInput {
  kind: "handicap";
  line: number | string;
  home: PlatformOddsInput;
  away: PlatformOddsInput;
}

export interface OverUnderMarketInput {
  kind: "overUnder";
  line: number;
  over: PlatformOddsInput;
  under: PlatformOddsInput;
}

export interface BttsMarketInput {
  kind: "btts";
  yes: PlatformOddsInput;
  no: PlatformOddsInput;
}

export type MarketInput =
  | MoneylineMarketInput
  | HandicapMarketInput
  | OverUnderMarketInput
  | BttsMarketInput;

/** 平台賠率 → Decimal Odds 轉換函式 */
export type OddsConverter = (value: number) => number | null;
