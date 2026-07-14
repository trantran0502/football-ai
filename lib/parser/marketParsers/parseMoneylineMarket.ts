import type { MarketSelection } from "@/types/match";
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

const MONEYLINE_LABELS = ["主", "客", "和"] as const;

function extractLabeledMoneylineOdds(
  content: string | string[]
): { home: string; draw: string; away: string } | null {
  const tokens = tokenizeMarketContent(content);
  const oddsByLabel = new Map<string, string>();

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!MONEYLINE_LABELS.includes(token as (typeof MONEYLINE_LABELS)[number])) {
      continue;
    }
    const next = tokens[i + 1];
    if (next && isOddsToken(next)) {
      oddsByLabel.set(token, next);
      i++;
    }
  }

  const home = oddsByLabel.get("主");
  const draw = oddsByLabel.get("和");
  const away = oddsByLabel.get("客");
  if (home && draw && away) {
    return { home, draw, away };
  }

  const odds = tokens.filter(isOddsToken);
  if (odds.length >= 3) {
    return { home: odds[0], draw: odds[1], away: odds[2] };
  }

  return null;
}

export function parseMoneylineMarket(
  title: string,
  content: string | string[]
): MarketSelection[] {
  const extracted = extractLabeledMoneylineOdds(content);
  if (!extracted) {
    return [];
  }

  const period = inferMarketPeriod(title);
  const family = resolveMarketFamily("moneyline", title);
  const selections: MarketSelection[] = [];

  const home = parseOddsNumber(extracted.home);
  const draw = parseOddsNumber(extracted.draw);
  const away = parseOddsNumber(extracted.away);

  if (home !== null) {
    selections.push({
      marketType: "moneyline",
      marketFamily: family,
      title,
      period,
      side: "home",
      rawLine: null,
      line: null,
      modifier: null,
      odds: home,
    });
  }
  if (draw !== null) {
    selections.push({
      marketType: "moneyline",
      marketFamily: family,
      title,
      period,
      side: "draw",
      rawLine: null,
      line: null,
      modifier: null,
      odds: draw,
    });
  }
  if (away !== null) {
    selections.push({
      marketType: "moneyline",
      marketFamily: family,
      title,
      period,
      side: "away",
      rawLine: null,
      line: null,
      modifier: null,
      odds: away,
    });
  }

  return selections;
}

/** 從「上半場獨贏與讓分」區塊擷取獨贏部分（遇讓分標籤即停止）。 */
export function parseMoneylinePrefixFromCombined(
  content: string | string[]
): MarketSelection[] {
  const tokens = tokenizeMarketContent(content);
  let handicapStart = tokens.length;

  for (let i = 0; i < tokens.length; i++) {
    if (/^(主|客)(?:\(|\d)/.test(tokens[i])) {
      handicapStart = i;
      break;
    }
  }

  if (handicapStart === 0) {
    return [];
  }

  return parseMoneylineMarket("上半場獨贏", tokens.slice(0, handicapStart));
}

export function parseMoneylineMarketContent(
  title: string,
  content: string | string[]
): MarketSelection[] {
  return parseMoneylineMarket(title, normalizeMarketContent(content));
}
