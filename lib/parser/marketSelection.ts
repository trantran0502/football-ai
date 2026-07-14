import type {
  BetSide,
  MarketSelection,
  MarketSide,
  MarketType,
} from "@/types/match";
import { modifierToWater } from "@/lib/parser/asianRules";
import {
  inferMarketPeriod,
  resolveMarketFamily,
} from "@/lib/parser/marketMeta";
import { parseOddsNumber } from "@/lib/parser/oddsUtils";
import { parseAsianMarket } from "@/lib/parser/marketParsers/parseAsianMarket";
import { parseMoneylineMarket } from "@/lib/parser/marketParsers/parseMoneylineMarket";
import {
  parseCorrectScoreMarket,
  parseDoubleChanceMarket,
  parseHalfTimeFullTimeMarket,
} from "@/lib/parser/marketParsers";

export { parseOddsNumber } from "@/lib/parser/oddsUtils";

export function buildBinaryMarketSelections(
  marketType: Extract<MarketType, "btts" | "oddEven">,
  title: string,
  primaryOdds: string,
  secondaryOdds: string,
  primarySide: Extract<MarketSide, "yes" | "no" | "odd" | "even">,
  secondarySide: Extract<MarketSide, "yes" | "no" | "odd" | "even">
): MarketSelection[] {
  const period = inferMarketPeriod(title);
  const family = resolveMarketFamily(marketType, title);
  const primary = parseOddsNumber(primaryOdds);
  const secondary = parseOddsNumber(secondaryOdds);
  const selections: MarketSelection[] = [];

  if (primary !== null) {
    selections.push({
      marketType,
      marketFamily: family,
      title,
      period,
      side: primarySide,
      rawLine: null,
      line: null,
      modifier: null,
      odds: primary,
    });
  }
  if (secondary !== null) {
    selections.push({
      marketType,
      marketFamily: family,
      title,
      period,
      side: secondarySide,
      rawLine: null,
      line: null,
      modifier: null,
      odds: secondary,
    });
  }

  return selections;
}

function projectBetSide(selection: MarketSelection): BetSide {
  switch (selection.side) {
    case "home":
    case "away":
    case "over":
    case "under":
    case "draw":
    case "yes":
    case "no":
    case "odd":
    case "even":
      return selection.side;
    case "homeOrDraw":
    case "drawOrAway":
    case "homeOrAway":
      return "draw";
    case "none":
      if (
        selection.marketType === "firstGoal" ||
        selection.marketType === "lastGoal"
      ) {
        return "no";
      }
      return "draw";
    default:
      return "home";
  }
}

/** 將 MarketSelection 投影為既有 BettingSelection（UI / 分析相容）。 */
export function projectToBettingSelection(
  selection: MarketSelection
): import("@/types/match").BettingSelection {
  const water =
    selection.modifier !== null
      ? modifierToWater(selection.modifier)
      : null;

  return {
    marketType: selection.marketType,
    title: selection.title,
    period: selection.period === "segment" ? "full" : selection.period,
    side: projectBetSide(selection),
    line: selection.line ?? 0,
    water,
    odds: selection.odds,
  };
}

export function projectMarketSelections(
  selections: MarketSelection[]
): import("@/types/match").BettingSelection[] {
  return selections.map(projectToBettingSelection);
}

/** @deprecated 使用 parseAsianMarket */
export function buildAsianMarketSelectionsFromContent(
  marketType: MarketType,
  title: string,
  content: string | string[],
  family: "asianHandicap" | "asianOverUnder"
) {
  return parseAsianMarket(marketType, title, content, family);
}

/** @deprecated 使用 parseMoneylineMarket */
export function buildMoneylineMarketSelections(
  title: string,
  homeOdds: string,
  drawOdds: string,
  awayOdds: string
) {
  return parseMoneylineMarket(title, `${homeOdds} ${drawOdds} ${awayOdds}`);
}

/** @deprecated */
export function buildFormalMarketSelections(
  marketType: Extract<
    MarketType,
    "correctScore" | "halfTimeFullTime" | "doubleChance" | "special"
  >,
  title: string,
  content: string | string[]
) {
  switch (marketType) {
    case "correctScore":
      return parseCorrectScoreMarket(title, content);
    case "halfTimeFullTime":
      return parseHalfTimeFullTimeMarket(title, content);
    case "doubleChance":
      return parseDoubleChanceMarket(title, content);
    default:
      return [];
  }
}
