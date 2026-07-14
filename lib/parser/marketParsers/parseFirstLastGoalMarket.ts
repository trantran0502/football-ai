import type { MarketSelection, MarketType } from "@/types/match";
import {
  inferMarketPeriod,
  resolveMarketFamily,
} from "@/lib/parser/marketMeta";
import {
  isOddsToken,
  tokenizeMarketContent,
  parseOddsNumber,
} from "@/lib/parser/oddsUtils";

const GOAL_SIDE_LABELS: Record<string, import("@/types/match").MarketSide> = {
  主: "home",
  客: "away",
  否: "none",
};

export function parseFirstLastGoalMarket(
  marketType: Extract<MarketType, "firstGoal" | "lastGoal">,
  title: string,
  content: string | string[]
): MarketSelection[] {
  const period = inferMarketPeriod(title);
  const family = resolveMarketFamily(marketType, title);
  const tokens = tokenizeMarketContent(content);
  const selections: MarketSelection[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const side = GOAL_SIDE_LABELS[token];
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
      marketType,
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
