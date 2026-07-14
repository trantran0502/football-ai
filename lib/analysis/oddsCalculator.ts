import {
  convertRawOddsToImpliedProbability,
} from "@/lib/analysis/featureScore/oddsConversion";

/**
 * 將原始賠率轉換為隱含勝率（0～1）。
 * 香港盤 (< 1.01)：decimalOdds = rawOdds + 1
 * 十進位 (>= 1.01)：decimalOdds = rawOdds
 */
export function europeanOddsToProbability(odds: number): number | null {
  return convertRawOddsToImpliedProbability(odds);
}

/**
 * 從文字中提取十進位賠率（>= 1.01）。
 */
export function extractEuropeanOdds(text: string): number[] {
  const matches = text.match(/\d+\.\d+/g);
  if (!matches) {
    return [];
  }

  return matches
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 1.01);
}

/**
 * 將隱含勝率轉換為 0-100 分數。
 */
export function impliedProbabilityToScore(probability: number): number {
  if (!Number.isFinite(probability) || probability <= 0) {
    return 0;
  }
  return Math.min(100, probability * 100);
}
