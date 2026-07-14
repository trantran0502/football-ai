import { runAnalysisEngine } from "@/lib/analysis/analysisEngine";
import { evaluateCandidate } from "@/lib/backtest/betEvaluator";
import { computeStatistics } from "@/lib/backtest/statistics";
import type {
  BacktestEngineResult,
  BacktestMatch,
  CandidateBacktestEntry,
} from "@/lib/backtest/types";

/**
 * 對多場比賽執行回測：
 * Analysis → Candidate → Settlement → Profit
 */
export function runBacktest(matches: BacktestMatch[]): BacktestEngineResult {
  const entries: CandidateBacktestEntry[] = [];

  for (const match of matches) {
    const analysis = runAnalysisEngine(match.marketSelections);

    for (const candidate of analysis.candidates) {
      const evaluation = evaluateCandidate(
        candidate,
        match.marketSelections,
        match.result
      );

      entries.push({
        matchId: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        candidate,
        evaluation,
      });
    }
  }

  return {
    entries,
    statistics: computeStatistics(entries, matches.length),
  };
}
