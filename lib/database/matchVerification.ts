import { runBacktest } from "@/lib/backtest/backtestEngine";
import type { BacktestMatch } from "@/lib/backtest/types";
import type {
  HistoricalMatchRecord,
  MatchVerificationResult,
} from "@/lib/database/matchSchema";
import { runRuleValidation } from "@/lib/rules/validation/ruleValidator";

export function runMatchVerification(
  record: HistoricalMatchRecord,
  allVerifiedMatches: HistoricalMatchRecord[]
): MatchVerificationResult {
  if (!record.result) {
    throw new Error("Match result is required before verification.");
  }

  const backtestMatch: BacktestMatch = {
    id: record.id,
    date: record.matchDate,
    league: record.league,
    homeTeam: record.homeTeam,
    awayTeam: record.awayTeam,
    marketSelections: record.marketSelections,
    result: record.result,
  };

  const backtest = runBacktest([backtestMatch]);
  const ruleValidation = runRuleValidation(allVerifiedMatches, {
    mode: "evaluate",
  });

  return {
    verifiedAt: new Date().toISOString(),
    backtest,
    ruleValidation,
  };
}
