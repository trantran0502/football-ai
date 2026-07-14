import type { MarketSelection, MarketType } from "@/types/match";
import { resolveMarketFamily, detectAsianFamilyFromContent } from "@/lib/parser/marketMeta";
import {
  parseAsianMarket,
  parseCombinedHalfMoneylineHandicapMarket,
  parseCorrectScoreMarket,
  parseDoubleChanceMarket,
  parseFirstLastGoalMarket,
  parseHalfTimeFullTimeMarket,
  parseMoneylineMarket,
} from "@/lib/parser/marketParsers";
import {
  buildBinaryMarketSelections,
} from "@/lib/parser/marketSelection";
import {
  isOddsToken,
  tokenizeMarketContent,
} from "@/lib/parser/oddsUtils";

export {
  parseOddsNumber,
  projectMarketSelections,
  projectToBettingSelection,
} from "@/lib/parser/marketSelection";

export function buildMarketSelectionsForType(
  marketType: MarketType,
  title: string,
  content: string | string[]
): MarketSelection[] {
  const contentFamily = detectAsianFamilyFromContent(content);
  const family = contentFamily ?? resolveMarketFamily(marketType, title);

  switch (family) {
    case "asianHandicap":
      return parseAsianMarket(marketType, title, content, "asianHandicap");
    case "asianOverUnder":
      return parseAsianMarket(marketType, title, content, "asianOverUnder");
    case "moneyline":
      return parseMoneylineMarket(title, content);
    case "btts": {
      const odds = tokenizeMarketContent(content).filter(isOddsToken);
      if (odds.length < 2) {
        return [];
      }
      return buildBinaryMarketSelections(
        "btts",
        title,
        odds[0],
        odds[1],
        "yes",
        "no"
      );
    }
    case "oddEven": {
      const odds = tokenizeMarketContent(content).filter(isOddsToken);
      if (odds.length < 2) {
        return [];
      }
      return buildBinaryMarketSelections(
        "oddEven",
        title,
        odds[0],
        odds[1],
        "odd",
        "even"
      );
    }
    case "correctScore":
      return parseCorrectScoreMarket(title, content);
    case "halfTimeFullTime":
      return parseHalfTimeFullTimeMarket(title, content);
    case "doubleChance":
      return parseDoubleChanceMarket(title, content);
    case "special":
      if (marketType === "firstGoal" || marketType === "lastGoal") {
        return parseFirstLastGoalMarket(marketType, title, content);
      }
      return [];
    default:
      return [];
  }
}

export function buildCombinedHalfMoneylineHandicapSelections(
  title: string,
  content: string | string[]
): MarketSelection[] {
  return parseCombinedHalfMoneylineHandicapMarket(title, content);
}

/** @deprecated 使用 parseAsianMarket */
export function buildHandicapSelectionsFromContent(
  title: string,
  content: string | string[]
) {
  return parseAsianMarket("handicap", title, content, "asianHandicap");
}

/** @deprecated */
export function buildAsianOverUnderSelectionsFromContent(
  marketType: MarketType,
  title: string,
  content: string | string[]
) {
  return parseAsianMarket(marketType, title, content, "asianOverUnder");
}

/** @deprecated */
export function buildSelectionsFromAsianLineBlock(
  marketType: MarketType,
  title: string,
  content: string | string[]
) {
  return buildMarketSelectionsForType(marketType, title, content);
}

/** @deprecated */
export function buildMoneylineSelections(
  title: string,
  homeOdds: string,
  drawOdds: string,
  awayOdds: string
) {
  return parseMoneylineMarket(title, `${homeOdds} ${drawOdds} ${awayOdds}`);
}

/** @deprecated */
export function buildBttsSelections(title: string, yesOdds: string, noOdds: string) {
  return buildBinaryMarketSelections("btts", title, yesOdds, noOdds, "yes", "no");
}

/** @deprecated */
export function buildOddEvenSelections(title: string, oddOdds: string, evenOdds: string) {
  return buildBinaryMarketSelections(
    "oddEven",
    title,
    oddOdds,
    evenOdds,
    "odd",
    "even"
  );
}

/** @deprecated */
export function buildHandicapSelectionsFromTokens(
  title: string,
  homeToken: string,
  awayToken: string | null,
  homeOdds: string,
  awayOdds: string
) {
  return parseAsianMarket("handicap", title, [
    `主(${homeToken})`,
    homeOdds,
    awayToken ? `客(${awayToken})` : "客",
    awayOdds,
  ], "asianHandicap");
}

/** @deprecated */
export function buildAsianOverUnderSelectionsFromTokens(
  marketType: MarketType,
  title: string,
  overToken: string,
  underToken: string | null,
  overOdds: string,
  underOdds: string
) {
  return parseAsianMarket(marketType, title, [
    `大(${overToken})`,
    overOdds,
    underToken ? `小(${underToken})` : "小",
    underOdds,
  ], "asianOverUnder");
}

export function inferPeriodFromTitle(title: string): "full" | "half" {
  return /上半|上半场/.test(title) ? "half" : "full";
}
