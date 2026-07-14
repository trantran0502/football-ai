import type { MarketSelection } from "@/types/match";
import { parseAsianMarketLine } from "@/lib/parser/asianRules";
import {
  parseAsianSuffixFromCombined,
} from "@/lib/parser/marketParsers/parseAsianMarket";
import {
  parseMoneylinePrefixFromCombined,
} from "@/lib/parser/marketParsers/parseMoneylineMarket";

function titleForHandicapGroup(
  selections: MarketSelection[]
): string {
  const anchor = selections.find((item) => item.side === "home") ?? selections[0];
  const raw = anchor?.rawLine ?? "0";
  const parsed = parseAsianMarketLine(raw);
  if (!parsed) {
    return `上半場讓分（${raw}）`;
  }
  if (parsed.modifier === "minus50" || parsed.modifier === "plus50") {
    return `上半場讓分（${parsed.line}-50）`;
  }
  return `上半場讓分（${parsed.raw}）`;
}

function groupHandicapSelectionsByLine(
  selections: MarketSelection[]
): MarketSelection[] {
  const grouped: MarketSelection[] = [];

  for (let i = 0; i < selections.length; i += 2) {
    const home = selections[i];
    const away = selections[i + 1];
    if (!home || !away) {
      if (home) {
        grouped.push(home);
      }
      continue;
    }

    const title = titleForHandicapGroup([home, away]);
    grouped.push({ ...home, title, period: "half" }, { ...away, title, period: "half" });
  }

  return grouped;
}

/** 解析「上半場獨贏與讓分」合併區塊。 */
export function parseCombinedHalfMoneylineHandicapMarket(
  _title: string,
  content: string | string[]
): MarketSelection[] {
  const moneyline = parseMoneylinePrefixFromCombined(content);
  const handicap = groupHandicapSelectionsByLine(
    parseAsianSuffixFromCombined(content)
  );
  return [...moneyline, ...handicap];
}
