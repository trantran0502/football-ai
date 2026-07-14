/**
 * 將歐洲賠率轉換為隱含勝率。
 * 公式：probability = 1 / odds
 */
export function europeanOddsToProbability(odds: number): number | null {
  if (!Number.isFinite(odds) || odds <= 0) {
    return null;
  }
  return 1 / odds;
}

/**
 * 從文字中提取歐洲賠率（>= 1.01）。
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
