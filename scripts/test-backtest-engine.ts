import { runBacktest } from "../lib/backtest/backtestEngine";
import { settleBet } from "../lib/backtest/settlement";
import {
  createMockBacktestMatches,
  SETTLEMENT_TEST_CASES,
} from "../lib/backtest/mockData";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function testSettlementCases(): void {
  for (const testCase of SETTLEMENT_TEST_CASES) {
    const actual = settleBet(testCase.selection, testCase.result);
    assertEqual(actual, testCase.expected, testCase.name);
  }
  console.log(`Settlement cases passed: ${SETTLEMENT_TEST_CASES.length}`);
}

function testBacktestEngine(): void {
  const matches = createMockBacktestMatches();
  const result = runBacktest(matches);

  if (result.statistics.totalMatches !== matches.length) {
    throw new Error("statistics totalMatches mismatch");
  }
  if (result.entries.length !== 0) {
    throw new Error("backtest should not produce candidates without rules");
  }
  if (result.statistics.totalBets !== 0) {
    throw new Error("statistics totalBets should be 0");
  }

  console.log("Backtest statistics:", result.statistics);
}

testSettlementCases();
testBacktestEngine();
console.log("All backtest engine tests passed.");
