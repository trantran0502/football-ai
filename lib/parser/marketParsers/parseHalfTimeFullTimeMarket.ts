import type { MarketSelection } from "@/types/match";
import {
  inferMarketPeriod,
  resolveMarketFamily,
} from "@/lib/parser/marketMeta";
import { normalizeMarketContent, parseOddsNumber } from "@/lib/parser/oddsUtils";

const HTFT_LABEL_PATTERN = /(主|和|客)\/(主|和|客)/g;

const EXPECTED_HTFT_LABELS = [
  "主/主",
  "主/和",
  "主/客",
  "和/主",
  "和/和",
  "和/客",
  "客/主",
  "客/和",
  "客/客",
] as const;

export function parseHalfTimeFullTimeMarket(
  title: string,
  content: string | string[]
): MarketSelection[] {
  const text = normalizeMarketContent(content);
  const period = inferMarketPeriod(title);
  const family = resolveMarketFamily("halfTimeFullTime", title);
  const selections: MarketSelection[] = [];
  const found = new Map<string, number>();

  const labelPositions: Array<{ label: string; index: number; end: number }> =
    [];
  for (const match of text.matchAll(HTFT_LABEL_PATTERN)) {
    if (match.index === undefined) {
      continue;
    }
    labelPositions.push({
      label: match[0],
      index: match.index,
      end: match.index + match[0].length,
    });
  }

  for (let i = 0; i < labelPositions.length; i++) {
    const current = labelPositions[i];
    const next = labelPositions[i + 1];
    const oddsText = text
      .slice(current.end, next ? next.index : text.length)
      .trim();
    const odds = parseOddsNumber(oddsText);
    if (odds !== null) {
      found.set(current.label, odds);
    }
  }

  for (const label of EXPECTED_HTFT_LABELS) {
    const odds = found.get(label);
    if (odds !== undefined) {
      selections.push({
        marketType: "halfTimeFullTime",
        marketFamily: family,
        title,
        period,
        side: "none",
        label,
        rawLine: label,
        line: null,
        modifier: null,
        odds,
      });
    }
  }

  if (selections.length === 0) {
    for (const [label, odds] of found) {
      selections.push({
        marketType: "halfTimeFullTime",
        marketFamily: family,
        title,
        period,
        side: "none",
        label,
        rawLine: label,
        line: null,
        modifier: null,
        odds,
      });
    }
  }

  return selections;
}
