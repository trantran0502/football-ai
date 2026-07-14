import type { MarketSelection, MarketSide } from "@/types/match";
import {
  inferMarketPeriod,
  resolveMarketFamily,
} from "@/lib/parser/marketMeta";
import {
  isOddsToken,
  normalizeMarketContent,
  parseOddsNumber,
  tokenizeMarketContent,
} from "@/lib/parser/oddsUtils";

const DOUBLE_CHANCE_SIDES: Record<string, MarketSide> = {
  主或和: "homeOrDraw",
  和或客: "drawOrAway",
  主或客: "homeOrAway",
};

const DOUBLE_CHANCE_PATTERN =
  /(主或和|和或客|主或客)\s*(\d+(?:\.\d+)?)/g;

export function parseDoubleChanceMarket(
  title: string,
  content: string | string[]
): MarketSelection[] {
  const text = normalizeMarketContent(content);
  const period = inferMarketPeriod(title);
  const family = resolveMarketFamily("doubleChance", title);
  const selections: MarketSelection[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(DOUBLE_CHANCE_PATTERN)) {
    const label = match[1];
    const side = DOUBLE_CHANCE_SIDES[label];
    const odds = parseOddsNumber(match[2]);
    if (!side || odds === null || seen.has(label)) {
      continue;
    }
    seen.add(label);
    selections.push({
      marketType: "doubleChance",
      marketFamily: family,
      title,
      period,
      side,
      label,
      rawLine: label,
      line: null,
      modifier: null,
      odds,
    });
  }

  if (selections.length > 0) {
    return selections;
  }

  const tokens = tokenizeMarketContent(content);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const side = DOUBLE_CHANCE_SIDES[token];
    if (!side || seen.has(token)) {
      continue;
    }
    const next = tokens[i + 1];
    if (!next || !isOddsToken(next)) {
      continue;
    }
    const odds = parseOddsNumber(next);
    if (odds === null) {
      continue;
    }
    seen.add(token);
    selections.push({
      marketType: "doubleChance",
      marketFamily: family,
      title,
      period,
      side,
      label: token,
      rawLine: token,
      line: null,
      modifier: null,
      odds,
    });
    i++;
  }

  return selections;
}
