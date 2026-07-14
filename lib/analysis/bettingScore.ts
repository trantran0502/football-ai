import type { BetSide, BettingSelection, MatchData } from "@/types/match";
import {
  europeanOddsToProbability,
  extractEuropeanOdds,
  impliedProbabilityToScore,
} from "@/lib/analysis/oddsCalculator";

export interface BettingOption {
  market: string;
  selection: string;
  odds: number;
  impliedProbability: number;
  value: number;
  score: number;
}

const PROBABILITY_WEIGHT = 0.7;
const VALUE_WEIGHT = 0.3;

const LABELED_ODDS_PATTERN = /([^\d\s/+-]+)\s*(\d+\.\d+)/g;

const DEFAULT_SELECTIONS: Record<string, string[]> = {
  moneyline: ["主", "和", "客"],
  handicap: ["主", "客"],
  overUnder: ["大", "小"],
  btts: ["是", "否"],
};

const MARKET_LABELS: Record<string, string> = {
  moneyline: "獨贏",
  handicap: "亞洲讓分",
  totalGoals: "大小球",
  overUnder: "大小球",
  btts: "BTTS",
};

const SIDE_LABELS: Record<BetSide, string> = {
  home: "主",
  away: "客",
  over: "大",
  under: "小",
  draw: "和",
  yes: "是",
  no: "否",
  odd: "單",
  even: "雙",
};

const LEGACY_MARKET_KEYS: Record<BettingSelection["marketType"], string> = {
  moneyline: "moneyline",
  handicap: "handicap",
  totalGoals: "overUnder",
  teamGoals: "overUnder",
  corners: "overUnder",
  cards: "overUnder",
  btts: "btts",
  oddEven: "oddEven",
  correctScore: "other",
  halfTimeFullTime: "other",
  doubleChance: "other",
  firstGoal: "other",
  lastGoal: "other",
  special: "other",
};

/**
 * 計算隱含機率評分（0-100）。
 * 機率越高，分數越高。
 */
export function calculateProbabilityScore(probability: number): number {
  return impliedProbabilityToScore(probability);
}

/**
 * 計算賠率價值：value = probability * odds
 */
export function calculateOddsValue(probability: number, odds: number): number {
  return probability * odds;
}

/**
 * 將賠率價值轉換為 0-100 分數。
 */
export function calculateValueScore(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(100, value * 100);
}

/**
 * 計算單一賠率的下注評分（0-100）。
 * 70% 隱含機率 + 30% 賠率價值。
 */
export function calculateOptionScore(odds: number): number {
  const probability = europeanOddsToProbability(odds);
  if (probability === null) {
    return 0;
  }

  const probabilityScore = calculateProbabilityScore(probability);
  const value = calculateOddsValue(probability, odds);
  const valueScore = calculateValueScore(value);

  return Math.round(
    PROBABILITY_WEIGHT * probabilityScore + VALUE_WEIGHT * valueScore
  );
}

function parseLabeledOptions(content: string): Array<{ selection: string; odds: number }> {
  const options: Array<{ selection: string; odds: number }> = [];

  for (const match of content.matchAll(LABELED_ODDS_PATTERN)) {
    const odds = Number(match[2]);
    if (odds >= 1.01) {
      options.push({
        selection: match[1].trim(),
        odds,
      });
    }
  }

  return options;
}

function parseDefaultOptions(
  market: string,
  content: string
): Array<{ selection: string; odds: number }> {
  const odds = extractEuropeanOdds(content);
  const labels = DEFAULT_SELECTIONS[market] ?? [];

  if (odds.length === 0) {
    return [];
  }

  if (odds.length === labels.length) {
    return odds.map((value, index) => ({
      selection: labels[index],
      odds: value,
    }));
  }

  return odds.map((value, index) => ({
    selection: `選項 ${index + 1}`,
    odds: value,
  }));
}

function extractMarketOptions(
  market: string,
  entries: string[]
): Array<{ selection: string; odds: number }> {
  const options: Array<{ selection: string; odds: number }> = [];

  for (const entry of entries) {
    const labeled = parseLabeledOptions(entry);
    if (labeled.length > 0) {
      options.push(...labeled);
      continue;
    }

    options.push(...parseDefaultOptions(market, entry));
  }

  return options;
}

function selectionToBettingOption(selection: BettingSelection): BettingOption | null {
  const legacyKey = LEGACY_MARKET_KEYS[selection.marketType];
  if (!legacyKey || legacyKey === "other") {
    return null;
  }

  const market = MARKET_LABELS[legacyKey] ?? selection.title;
  const probability = europeanOddsToProbability(selection.odds);
  if (probability === null) {
    return null;
  }

  const value = calculateOddsValue(probability, selection.odds);

  return {
    market,
    selection: SIDE_LABELS[selection.side],
    odds: selection.odds,
    impliedProbability: probability,
    value,
    score: calculateOptionScore(selection.odds),
  };
}

function extractLegacyBettingOptions(match: MatchData): BettingOption[] {
  const marketEntries: Array<[string, string[]]> = [
    ["moneyline", match.moneyline],
    ["handicap", match.handicap.map((item) =>
      item.home && item.away
        ? `${item.raw}  主 ${item.home}  客 ${item.away}`
        : item.raw
    )],
    ["overUnder", match.overUnder.map((item) =>
      item.over && item.under
        ? `${item.raw}  大 ${item.over}  小 ${item.under}`
        : item.raw
    )],
    ["btts", match.btts.map((item) =>
      item.yes && item.no ? `是 ${item.yes}  否 ${item.no}` : ""
    )],
  ];

  const options: BettingOption[] = [];

  for (const [market, entries] of marketEntries) {
    if (entries.length === 0) {
      continue;
    }

    const parsed = extractMarketOptions(market, entries);

    for (const item of parsed) {
      const probability = europeanOddsToProbability(item.odds);
      if (probability === null) {
        continue;
      }

      const value = calculateOddsValue(probability, item.odds);

      options.push({
        market: MARKET_LABELS[market] ?? market,
        selection: item.selection,
        odds: item.odds,
        impliedProbability: probability,
        value,
        score: calculateOptionScore(item.odds),
      });
    }
  }

  return options;
}

/**
 * 從 MatchData 提取所有可評分的投注選項。
 */
export function extractBettingOptions(match: MatchData): BettingOption[] {
  if (match.selections.length > 0) {
    return match.selections
      .map(selectionToBettingOption)
      .filter((item): item is BettingOption => item !== null);
  }

  return extractLegacyBettingOptions(match);
}

/**
 * 對整場比賽盤口資料評分，回傳最高選項分數（0-100）。
 * 若無有效盤口，回傳 0。
 */
export function calculateBettingScore(match: MatchData): number {
  const options = extractBettingOptions(match);
  if (options.length === 0) {
    return 0;
  }

  return Math.max(...options.map((option) => option.score));
}

/**
 * 回傳所有已評分的投注選項。
 */
export function scoreMatchBets(match: MatchData): BettingOption[] {
  return extractBettingOptions(match);
}
