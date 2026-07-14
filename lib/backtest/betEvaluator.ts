import type { AnalysisCandidate } from "@/lib/analysis/types";
import { buildMarketId } from "@/lib/analysis/featureBuilder";
import { settleBet } from "@/lib/backtest/settlement";
import type { BetEvaluation, BetResult } from "@/lib/backtest/types";
import type { MatchResult } from "@/lib/database/matchSchema";
import type { MarketSelection } from "@/types/match";

const DEFAULT_STAKE = 1;

function resolveProfitOdds(odds: number): number {
  return odds >= 1.01 ? odds - 1 : odds;
}

export function calculateProfit(
  result: BetResult,
  odds: number,
  stake: number = DEFAULT_STAKE
): number {
  const profitOdds = resolveProfitOdds(odds);

  switch (result) {
    case "WIN":
      return stake * profitOdds;
    case "LOSE":
      return -stake;
    case "PUSH":
      return 0;
    case "HALF_WIN":
      return stake * profitOdds * 0.5;
    case "HALF_LOSE":
      return -stake * 0.5;
  }
}

function findSelectionForCandidate(
  candidate: AnalysisCandidate,
  marketSelections: MarketSelection[]
): MarketSelection | undefined {
  return marketSelections.find(
    (selection) =>
      buildMarketId(selection) === candidate.marketId &&
      selection.side === candidate.side
  );
}

function isHit(result: BetResult): boolean {
  return result === "WIN" || result === "HALF_WIN";
}

/**
 * 評估單一 Candidate 在賽果下的盈虧與命中。
 */
export function evaluateCandidate(
  candidate: AnalysisCandidate,
  marketSelections: MarketSelection[],
  matchResult: MatchResult,
  stake: number = DEFAULT_STAKE
): BetEvaluation {
  const selection = findSelectionForCandidate(candidate, marketSelections);

  if (!selection) {
    return {
      result: "LOSE",
      profit: -stake,
      hit: false,
      recommendationSucceeded: false,
      odds: 0,
      confidence: candidate.confidence,
      stake,
    };
  }

  const result = settleBet(selection, matchResult);
  const profit = calculateProfit(result, selection.odds, stake);
  const hit = isHit(result);

  return {
    result,
    profit,
    hit,
    recommendationSucceeded: hit,
    odds: selection.odds,
    confidence: candidate.confidence,
    stake,
  };
}
