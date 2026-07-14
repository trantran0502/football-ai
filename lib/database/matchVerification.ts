import { runBacktest } from "@/lib/backtest/backtestEngine";
import { validateDecisionOnRecord } from "@/lib/decision/decisionValidation";
import type { BacktestMatch } from "@/lib/backtest/types";
import type {
  HistoricalMatchRecord,
  MatchVerificationResult,
} from "@/lib/database/matchSchema";
import { runRuleValidation } from "@/lib/rules/validation/ruleValidator";
import {
  validateVerifiedMatch,
  validateVerifiedMatchFromPipeline,
} from "@/lib/validation/validationEngine";

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
  const recommendationValidation = resolveRecommendationValidation({
    ...record,
    status: "VERIFIED",
  });

  return {
    verifiedAt: new Date().toISOString(),
    backtest,
    ruleValidation,
    recommendationValidation: {
      ...recommendationValidation,
      decisionEntry: validateDecisionOnRecord(record),
    },
  };
}

function resolveRecommendationValidation(
  record: HistoricalMatchRecord
): MatchVerificationResult["recommendationValidation"] {
  const storedRecommendation =
    record.analysisSnapshot?.recommendation?.result ?? null;
  if (storedRecommendation) {
    return validateVerifiedMatch(record, storedRecommendation);
  }
  return validateVerifiedMatchFromPipeline(record);
}
