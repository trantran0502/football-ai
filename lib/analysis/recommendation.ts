import type { MatchData } from "@/types/match";
import { extractBettingOptions } from "@/lib/analysis/bettingScore";

export interface Recommendation {
  market: string;
  selection: string;
  odds: number;
  impliedProbability: number;
  value: number;
  score: number;
}

/**
 * 回傳評分最高的投注選項。
 * 若無有效盤口資料，回傳 null。
 */
export function getRecommendation(match: MatchData): Recommendation | null {
  const options = extractBettingOptions(match);

  if (options.length === 0) {
    return null;
  }

  const best = options.reduce((current, candidate) =>
    candidate.score > current.score ? candidate : current
  );

  return {
    market: best.market,
    selection: best.selection,
    odds: best.odds,
    impliedProbability: best.impliedProbability,
    value: best.value,
    score: best.score,
  };
}
