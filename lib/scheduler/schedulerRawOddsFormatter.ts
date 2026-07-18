import { formatAsianLineRaw } from "@/lib/parser/asianLine";
import { parseOdds } from "@/lib/parser/parser";
import { hasParsedMarkets } from "@/lib/parser/syncLegacyMarkets";
import type { OddsData } from "@/lib/providers/providerTypes";
import type { MarketSelection, MarketType } from "@/types/match";

const SCHEDULER_MARKET_ORDER: MarketType[] = [
  "moneyline",
  "handicap",
  "totalGoals",
  "btts",
];

const SIDE_PREFIX: Partial<Record<MarketSelection["side"], string>> = {
  home: "主",
  away: "客",
  draw: "和",
  over: "大",
  under: "小",
  yes: "是",
  no: "否",
};

function formatOddsValue(odds: number): string {
  return String(odds);
}

function formatLineToken(selection: MarketSelection): string | null {
  if (selection.rawLine) {
    return selection.rawLine;
  }
  if (selection.line === null || selection.line === undefined) {
    return null;
  }
  return formatAsianLineRaw(selection.line, null);
}

function formatSelectionLine(selection: MarketSelection): string | null {
  const prefix = SIDE_PREFIX[selection.side];
  if (!prefix) {
    return null;
  }

  const odds = formatOddsValue(selection.odds);
  const lineToken = formatLineToken(selection);

  if (selection.marketType === "moneyline") {
    return `${prefix} ${odds}`;
  }

  if (selection.marketType === "handicap") {
    if (!lineToken) {
      return null;
    }
    return `${prefix}${lineToken} ${odds}`;
  }

  if (selection.marketType === "totalGoals") {
    if (selection.side === "over") {
      if (!lineToken) {
        return null;
      }
      return `${prefix}(${lineToken}) ${odds}`;
    }
    if (lineToken) {
      return `${prefix}(${lineToken}) ${odds}`;
    }
    return `${prefix} ${odds}`;
  }

  if (selection.marketType === "btts") {
    return `${prefix} ${odds}`;
  }

  return null;
}

function groupKey(selection: MarketSelection): string {
  return `${selection.marketType}:${selection.title}:${selection.period}`;
}

function sortMarketGroups(
  left: { marketType: MarketType },
  right: { marketType: MarketType }
): number {
  return (
    SCHEDULER_MARKET_ORDER.indexOf(left.marketType) -
    SCHEDULER_MARKET_ORDER.indexOf(right.marketType)
  );
}

function buildGroupedLines(marketSelections: MarketSelection[]): string[] {
  const groups = new Map<
    string,
    { title: string; marketType: MarketType; selections: MarketSelection[] }
  >();

  for (const selection of marketSelections) {
    const key = groupKey(selection);
    const existing = groups.get(key);
    if (existing) {
      existing.selections.push(selection);
      continue;
    }
    groups.set(key, {
      title: selection.title,
      marketType: selection.marketType,
      selections: [selection],
    });
  }

  const lines: string[] = [];
  for (const group of [...groups.values()].sort(sortMarketGroups)) {
    lines.push(group.title);
    for (const selection of group.selections) {
      const line = formatSelectionLine(selection);
      if (!line) {
        return [];
      }
      lines.push(line);
    }
  }

  return lines;
}

/**
 * 將 OddsData 格式化為 parser 可解析的 rawOdds 文字。
 * 失敗時回傳 null，不 throw。
 */
export function formatSchedulerRawOdds(oddsData: OddsData): string | null {
  try {
    if (!oddsData.homeTeam?.trim() || !oddsData.awayTeam?.trim()) {
      return null;
    }
    if (!oddsData.marketSelections?.length) {
      return null;
    }

    const header = `${oddsData.homeTeam} vs ${oddsData.awayTeam}`;
    const marketLines = buildGroupedLines(oddsData.marketSelections);
    if (marketLines.length === 0) {
      return null;
    }

    const rawOdds = [header, ...marketLines].join("\n");
    const parsed = parseOdds(rawOdds);
    if (!hasParsedMarkets(parsed)) {
      return null;
    }

    return rawOdds;
  } catch {
    return null;
  }
}
