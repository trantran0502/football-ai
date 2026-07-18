import { calculateProfit } from "@/lib/backtest/betEvaluator";
import { settleBet } from "@/lib/backtest/settlement";
import type { BetResult } from "@/lib/backtest/types";
import type { DecisionOutcome } from "@/lib/decision/v3/decisionTypes";
import type { MatchResult } from "@/lib/database/matchSchema";
import { pickLegacyTopCandidate } from "@/lib/recommendation/v3/recommendationDecisionAdapter";
import type { RecommendationEngineResult } from "@/lib/recommendation/recommendationTypes";
import type { DecisionV3ReplayBetSettlement } from "@/lib/replay/v3/decisionV3ReplayValidationTypes";
import type { MarketSelection } from "@/types/match";

const DEFAULT_STAKE = 1;

function settlePass(stake: number): DecisionV3ReplayBetSettlement {
  return {
    betResult: "PASS",
    profit: 0,
    odds: null,
    stake,
    marketType: null,
  };
}

function settleSelection(
  selection: MarketSelection,
  matchResult: MatchResult,
  stake: number
): DecisionV3ReplayBetSettlement {
  const betResult = settleBet(selection, matchResult);
  return {
    betResult,
    profit: calculateProfit(betResult, selection.odds, stake),
    odds: selection.odds,
    stake,
    marketType: selection.marketType,
  };
}

function findDecisionSelection(
  outcome: DecisionOutcome,
  marketSelections: MarketSelection[]
): MarketSelection | null {
  const candidate = outcome.candidate;
  if (!candidate) {
    return null;
  }

  return (
    marketSelections.find(
      (selection) =>
        selection.marketType === candidate.marketType &&
        selection.side === candidate.side &&
        selection.period === "full"
    ) ??
    marketSelections.find(
      (selection) =>
        selection.marketType === candidate.marketType &&
        selection.side === candidate.side
    ) ??
    null
  );
}

export function settleLegacyRecommendation(
  recommendation: RecommendationEngineResult | null,
  matchResult: MatchResult,
  stake: number = DEFAULT_STAKE
): DecisionV3ReplayBetSettlement {
  const candidate = pickLegacyTopCandidate(recommendation);
  if (!candidate || recommendation?.globalPass) {
    return settlePass(stake);
  }

  return settleSelection(candidate.selection, matchResult, stake);
}

export function settleDecisionOutcome(
  outcome: DecisionOutcome,
  marketSelections: MarketSelection[],
  matchResult: MatchResult,
  stake: number = DEFAULT_STAKE
): DecisionV3ReplayBetSettlement {
  if (outcome.decision === "pass") {
    return settlePass(stake);
  }

  const selection = findDecisionSelection(outcome, marketSelections);
  if (!selection) {
    return {
      betResult: "LOSE",
      profit: -stake,
      odds: null,
      stake,
      marketType: outcome.candidate?.marketType ?? null,
    };
  }

  return settleSelection(selection, matchResult, stake);
}

export function isBetSettlement(
  settlement: DecisionV3ReplayBetSettlement
): settlement is DecisionV3ReplayBetSettlement & { betResult: BetResult } {
  return settlement.betResult !== "PASS";
}

export function isWinningBetResult(result: BetResult): boolean {
  return result === "WIN" || result === "HALF_WIN";
}

export function computeMaxDrawdown(profits: number[]): number {
  let peak = 0;
  let cumulative = 0;
  let maxDrawdown = 0;

  for (const profit of profits) {
    cumulative += profit;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }

  return round(maxDrawdown);
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export { DEFAULT_STAKE as DECISION_V3_REPLAY_DEFAULT_STAKE };
