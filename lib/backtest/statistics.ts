import type { CandidateConfidence } from "@/lib/analysis/types";
import type {
  BacktestStatistics,
  CandidateBacktestEntry,
} from "@/lib/backtest/types";

const CONFIDENCE_SCORE: Record<CandidateConfidence, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

function countByResult(
  entries: CandidateBacktestEntry[],
  result: CandidateBacktestEntry["evaluation"]["result"]
): number {
  return entries.filter((entry) => entry.evaluation.result === result).length;
}

/**
 * 彙總回測統計。
 */
export function computeStatistics(
  entries: CandidateBacktestEntry[],
  totalMatches: number
): BacktestStatistics {
  const totalBets = entries.length;
  const wins = countByResult(entries, "WIN");
  const losses = countByResult(entries, "LOSE");
  const pushes = countByResult(entries, "PUSH");
  const halfWins = countByResult(entries, "HALF_WIN");
  const halfLoses = countByResult(entries, "HALF_LOSE");

  const totalProfit = entries.reduce(
    (sum, entry) => sum + entry.evaluation.profit,
    0
  );
  const totalStaked = entries.reduce(
    (sum, entry) => sum + entry.evaluation.stake,
    0
  );

  const winRate =
    totalBets === 0 ? 0 : (wins + halfWins * 0.5) / totalBets;

  const roi = totalStaked === 0 ? 0 : totalProfit / totalStaked;

  const averageOdds =
    totalBets === 0
      ? 0
      : entries.reduce((sum, entry) => sum + entry.evaluation.odds, 0) /
        totalBets;

  const averageConfidence =
    totalBets === 0
      ? 0
      : entries.reduce(
          (sum, entry) => sum + CONFIDENCE_SCORE[entry.evaluation.confidence],
          0
        ) / totalBets;

  return {
    totalMatches,
    totalBets,
    wins,
    losses,
    pushes,
    halfWins,
    halfLoses,
    winRate,
    roi,
    totalProfit,
    averageOdds,
    averageConfidence,
  };
}
