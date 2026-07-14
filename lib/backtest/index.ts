export { runBacktest } from "@/lib/backtest/backtestEngine";
export { evaluateCandidate, calculateProfit } from "@/lib/backtest/betEvaluator";
export { settleBet } from "@/lib/backtest/settlement";
export { computeStatistics } from "@/lib/backtest/statistics";
export {
  createMockBacktestMatches,
  SETTLEMENT_TEST_CASES,
} from "@/lib/backtest/mockData";

export type {
  BacktestEngineResult,
  BacktestMatch,
  BacktestStatistics,
  BetEvaluation,
  BetResult,
  CandidateBacktestEntry,
  SettlementTestCase,
} from "@/lib/backtest/types";
