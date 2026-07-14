import type { BetResult, GoalContext } from "@/lib/backtest/types";
import type { MatchResult } from "@/lib/database/matchSchema";
import {
  getHandicapSettlementAtBoundary,
  getSignedHandicap,
  getTotalSettlementAtBoundary,
  type AsianModifier,
  type HandicapAnchorSide,
  type SettlementAtBoundary,
} from "@/lib/parser/asianRules";
import type { MarketPeriod, MarketSelection } from "@/types/match";

function resolveGoalContext(
  period: MarketPeriod,
  matchResult: MatchResult
): GoalContext {
  if (period === "half") {
    return {
      homeGoals: matchResult.halfTimeHomeGoals,
      awayGoals: matchResult.halfTimeAwayGoals,
      totalGoals:
        matchResult.halfTimeHomeGoals + matchResult.halfTimeAwayGoals,
    };
  }

  return {
    homeGoals: matchResult.fullTimeHomeGoals,
    awayGoals: matchResult.fullTimeAwayGoals,
    totalGoals: matchResult.totalGoals,
  };
}

function inferHandicapAnchorSide(selection: MarketSelection): HandicapAnchorSide {
  const side = selection.side;
  if (side !== "home" && side !== "away") {
    return "home";
  }

  const handicap = selection.handicap;
  if (handicap === null || handicap === undefined) {
    return "home";
  }

  const asianLine = {
    raw: selection.rawLine ?? String(selection.line ?? 0),
    line: selection.line ?? 0,
    modifier: selection.modifier ?? "plain",
  };

  if (getSignedHandicap(side, "home", asianLine) === handicap) {
    return "home";
  }
  return "away";
}

function boundaryToBetResult(boundary: SettlementAtBoundary): BetResult {
  switch (boundary) {
    case "push":
      return "PUSH";
    case "halfWin":
      return "HALF_WIN";
    case "halfLose":
      return "HALF_LOSE";
    case "fullResult":
      return "LOSE";
  }
}

function settleQuarterOutcome(net0: number, net1: number): BetResult {
  const outcome0 = net0 > 0 ? 1 : net0 < 0 ? -1 : 0;
  const outcome1 = net1 > 0 ? 1 : net1 < 0 ? -1 : 0;
  const combined = outcome0 + outcome1;

  if (combined === 2) {
    return "WIN";
  }
  if (combined === -2) {
    return "LOSE";
  }
  if (combined === 0) {
    return "PUSH";
  }
  if (combined === 1) {
    return "HALF_WIN";
  }
  return "HALF_LOSE";
}

function settleMoneyline(
  selection: MarketSelection,
  matchResult: MatchResult,
  goals: GoalContext
): BetResult {
  void goals;
  const winner = matchResult.winner;

  if (selection.side === "home") {
    return winner === "home" ? "WIN" : "LOSE";
  }
  if (selection.side === "away") {
    return winner === "away" ? "WIN" : "LOSE";
  }
  if (selection.side === "draw") {
    return winner === "draw" ? "WIN" : "LOSE";
  }
  return "LOSE";
}

function settleHandicap(
  selection: MarketSelection,
  goals: GoalContext
): BetResult {
  const side = selection.side;
  if (side !== "home" && side !== "away") {
    return "LOSE";
  }

  const goalDiff =
    side === "home"
      ? goals.homeGoals - goals.awayGoals
      : goals.awayGoals - goals.homeGoals;
  const line = selection.line ?? 0;
  const modifier: AsianModifier = selection.modifier ?? "plain";
  const anchor = inferHandicapAnchorSide(selection);

  if (modifier === "minus50" || modifier === "plus50") {
    const plainLine = {
      raw: selection.rawLine ?? String(line),
      line,
      modifier: "plain" as const,
    };
    const splitLine = {
      raw: `${line + 0.5}`,
      line: line + 0.5,
      modifier: "half" as const,
    };
    const net0 = goalDiff + getSignedHandicap(side, anchor, plainLine);
    const net1 = goalDiff + getSignedHandicap(side, anchor, splitLine);

    if (net0 === 0) {
      return boundaryToBetResult(
        getHandicapSettlementAtBoundary(side, modifier)
      );
    }

    return settleQuarterOutcome(net0, net1);
  }

  const signedHandicap =
    selection.handicap ??
    getSignedHandicap(side, anchor, {
      raw: selection.rawLine ?? String(line),
      line,
      modifier,
    });
  const net = goalDiff + signedHandicap;

  if (modifier === "half") {
    return net > 0 ? "WIN" : "LOSE";
  }

  if (net > 0) {
    return "WIN";
  }
  if (net < 0) {
    return "LOSE";
  }
  return "PUSH";
}

function settleOverUnder(
  selection: MarketSelection,
  goals: GoalContext
): BetResult {
  const side = selection.side;
  if (side !== "over" && side !== "under") {
    return "LOSE";
  }

  const totalGoals = goals.totalGoals;
  const line = selection.line ?? 0;
  const modifier: AsianModifier = selection.modifier ?? "plain";

  if (modifier === "minus50" || modifier === "plus50") {
    const net0 = side === "over" ? totalGoals - line : line - totalGoals;
    const net1 =
      side === "over"
        ? totalGoals - (line + 0.5)
        : line + 0.5 - totalGoals;

    if (totalGoals === line) {
      return boundaryToBetResult(
        getTotalSettlementAtBoundary(side, modifier)
      );
    }

    return settleQuarterOutcome(net0, net1);
  }

  const net = side === "over" ? totalGoals - line : line - totalGoals;

  if (modifier === "half") {
    return net > 0 ? "WIN" : "LOSE";
  }

  if (net > 0) {
    return "WIN";
  }
  if (net < 0) {
    return "LOSE";
  }
  return "PUSH";
}

function settleBtts(
  selection: MarketSelection,
  matchResult: MatchResult
): BetResult {
  const bothScored = matchResult.bothTeamsScored;

  if (selection.side === "yes") {
    return bothScored ? "WIN" : "LOSE";
  }
  if (selection.side === "no") {
    return bothScored ? "LOSE" : "WIN";
  }
  return "LOSE";
}

/**
 * 依 MarketSelection 與 MatchResult 結算單注。
 */
export function settleBet(
  selection: MarketSelection,
  matchResult: MatchResult
): BetResult {
  const goals = resolveGoalContext(selection.period, matchResult);

  switch (selection.marketType) {
    case "moneyline":
      return settleMoneyline(selection, matchResult, goals);
    case "handicap":
      return settleHandicap(selection, goals);
    case "totalGoals":
    case "teamGoals":
    case "corners":
    case "cards":
      if (selection.marketFamily === "asianOverUnder") {
        return settleOverUnder(selection, goals);
      }
      return "LOSE";
    case "btts":
      return settleBtts(selection, matchResult);
    default:
      return "LOSE";
  }
}
