import type { MarketSelection } from "@/types/match";

function groupMarkets(
  marketSelections: readonly MarketSelection[],
  marketType: MarketSelection["marketType"],
  period: MarketSelection["period"] = "full"
): Map<string, MarketSelection[]> {
  const groups = new Map<string, MarketSelection[]>();

  for (const selection of marketSelections) {
    if (selection.marketType !== marketType || selection.period !== period) {
      continue;
    }

    const key = `${selection.title}::${selection.period}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(selection);
    groups.set(key, bucket);
  }

  return groups;
}

export function pickPrimaryMoneyline(
  marketSelections: readonly MarketSelection[]
): MarketSelection[] {
  const groups = groupMarkets(marketSelections, "moneyline");
  const entries = [...groups.entries()];
  const preferred = entries.find(([title]) => /獨贏|独赢/.test(title));
  return preferred?.[1] ?? entries[0]?.[1] ?? [];
}

export function pickPrimaryHandicap(
  marketSelections: readonly MarketSelection[]
): MarketSelection[] {
  const groups = groupMarkets(marketSelections, "handicap");
  const entries = [...groups.entries()];
  const preferred = entries.find(([title]) => /讓分|让分|讓球|让球/.test(title));
  return preferred?.[1] ?? entries[0]?.[1] ?? [];
}

export function pickPrimaryTotalGoals(
  marketSelections: readonly MarketSelection[]
): MarketSelection[] {
  const groups = groupMarkets(marketSelections, "totalGoals");
  const entries = [...groups.entries()];
  const preferred = entries.find(([title]) => /全場|全场|大小球|大小/.test(title));
  return preferred?.[1] ?? entries[0]?.[1] ?? [];
}

export function pickPrimaryBtts(
  marketSelections: readonly MarketSelection[]
): MarketSelection[] {
  const groups = groupMarkets(marketSelections, "btts");
  const entries = [...groups.entries()];
  const preferred = entries.find(([title]) => /雙方|双方|BTTS|btts/i.test(title));
  return preferred?.[1] ?? entries[0]?.[1] ?? [];
}
