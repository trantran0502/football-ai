import type { MarketSelection, MarketType } from "@/types/match";
import {
  getSignedHandicap,
  parseAsianMarketLine,
  type HandicapAnchorSide,
} from "@/lib/parser/asianRules";
import {
  inferMarketPeriod,
  labelToHandicapAnchorSide,
  labelToOverUnderSide,
  resolveMarketFamily,
} from "@/lib/parser/marketMeta";
import {
  parseSequentialAsianLineGroups,
  type SequentialAsianGroup,
} from "@/lib/parser/asianLine";
import { parseOddsNumber, tokenizeMarketContent } from "@/lib/parser/oddsUtils";

function buildAsianMarketSelection(
  marketType: MarketType,
  title: string,
  side: import("@/types/match").MarketSide,
  token: string,
  odds: string,
  anchorSide: HandicapAnchorSide | null
): MarketSelection | null {
  const asianLine = parseAsianMarketLine(token);
  const oddsNum = parseOddsNumber(odds);
  if (!asianLine || oddsNum === null) {
    return null;
  }

  const family = resolveMarketFamily(marketType, title);
  const period = inferMarketPeriod(title);
  const selection: MarketSelection = {
    marketType,
    marketFamily: family,
    title,
    period,
    side,
    rawLine: asianLine.raw,
    line: asianLine.line,
    modifier: asianLine.modifier,
    odds: oddsNum,
  };

  if (family === "asianHandicap" && anchorSide) {
    selection.handicap = getSignedHandicap(
      side as "home" | "away",
      anchorSide,
      asianLine
    );
  }

  return selection;
}

function groupToMarketSelections(
  marketType: MarketType,
  title: string,
  group: SequentialAsianGroup,
  family: "asianHandicap" | "asianOverUnder"
): MarketSelection[] {
  const selections: MarketSelection[] = [];

  for (const entry of group.sides) {
    let side: import("@/types/match").MarketSide | null = null;
    if (family === "asianHandicap") {
      side = labelToHandicapAnchorSide(entry.sideLabel);
    } else {
      side = labelToOverUnderSide(entry.sideLabel);
    }
    if (!side) {
      continue;
    }

    const anchorSide =
      family === "asianHandicap" ? group.anchorSide : null;
    const selection = buildAsianMarketSelection(
      marketType,
      title,
      side,
      entry.token,
      entry.odds,
      anchorSide as HandicapAnchorSide | null
    );
    if (selection) {
      selections.push(selection);
    }
  }

  return selections;
}

export function parseAsianMarket(
  marketType: MarketType,
  title: string,
  content: string | string[],
  family: "asianHandicap" | "asianOverUnder"
): MarketSelection[] {
  const primaryLabel = family === "asianHandicap" ? "主" : "大";
  const secondaryLabel = family === "asianHandicap" ? "客" : "小";
  const groups = parseSequentialAsianLineGroups(
    content,
    primaryLabel,
    secondaryLabel,
    family
  );

  return groups.flatMap((group) =>
    groupToMarketSelections(marketType, title, group, family)
  );
}

/** 從「上半場獨贏與讓分」區塊擷取讓分部分（跳過獨贏前綴）。 */
export function parseAsianSuffixFromCombined(
  content: string | string[]
): MarketSelection[] {
  const tokens = tokenizeMarketContent(content);
  let handicapStart = -1;

  for (let i = 0; i < tokens.length; i++) {
    if (/^(主|客)(?:\(|\d)/.test(tokens[i])) {
      handicapStart = i;
      break;
    }
  }

  if (handicapStart === -1) {
    return [];
  }

  return parseAsianMarket(
    "handicap",
    "上半場讓分",
    tokens.slice(handicapStart),
    "asianHandicap"
  );
}
