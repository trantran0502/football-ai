import type {
  BetSide,
  BettingSelection,
  MarketSelection,
  MatchData,
} from "@/types/match";
import { formatAsianLineRaw, modifierToWater } from "@/lib/parser/asianRules";
import { projectMarketSelections } from "@/lib/parser/marketSelection";

function emptyLegacyMarkets() {
  return {
    moneyline: [] as string[],
    handicap: [] as MatchData["handicap"],
    overUnder: [] as MatchData["overUnder"],
    btts: [] as MatchData["btts"],
    oddEven: [] as MatchData["oddEven"],
    otherMarkets: [] as MatchData["otherMarkets"],
  };
}

function groupKey(selection: MarketSelection): string {
  return `${selection.marketType}::${selection.title}`;
}

function groupMarketSelections(
  selections: MarketSelection[]
): Map<string, MarketSelection[]> {
  const groups = new Map<string, MarketSelection[]>();
  for (const selection of selections) {
    const key = groupKey(selection);
    const group = groups.get(key) ?? [];
    group.push(selection);
    groups.set(key, group);
  }
  return groups;
}

function findSide<T extends BetSide>(
  group: BettingSelection[],
  side: T
): BettingSelection | undefined {
  return group.find((item) => item.side === side);
}

function chunkPairs(
  group: MarketSelection[],
  primary: BetSide,
  secondary: BetSide
): MarketSelection[][] {
  const pairs: MarketSelection[][] = [];
  let current: MarketSelection[] = [];

  for (const selection of group) {
    if (selection.side === primary) {
      if (current.length > 0) {
        pairs.push(current);
      }
      current = [selection];
      continue;
    }
    if (selection.side === secondary && current.length === 1) {
      current.push(selection);
      pairs.push(current);
      current = [];
    }
  }

  if (current.length > 0) {
    pairs.push(current);
  }

  return pairs;
}

function legacyWater(selection: MarketSelection): string | null {
  return selection.modifier ? modifierToWater(selection.modifier) : null;
}

function legacyRaw(selection: MarketSelection): string {
  if (selection.rawLine) {
    return selection.rawLine;
  }
  if (selection.line !== null && selection.modifier) {
    return formatAsianLineRaw({
      raw: String(selection.line),
      line: selection.line,
      modifier: selection.modifier,
    });
  }
  return "";
}

/**
 * 由 marketSelections 同步相容舊欄位，不修改推薦邏輯所需結構。
 */
export function syncLegacyMarkets(data: MatchData): MatchData {
  const legacy = emptyLegacyMarkets();
  const selections = projectMarketSelections(data.marketSelections);
  const source = data.marketSelections;
  const groups = groupMarketSelections(source);

  for (const [, group] of groups) {
    const sample = group[0];
    if (!sample) {
      continue;
    }

    const projected = projectMarketSelections(group);

    switch (sample.marketType) {
      case "moneyline": {
        const home = projected.find((item) => item.side === "home");
        const draw = projected.find((item) => item.side === "draw");
        const away = projected.find((item) => item.side === "away");
        if (home && draw && away) {
          legacy.moneyline.push(
            `主 ${home.odds}  和 ${draw.odds}  客 ${away.odds}`
          );
        }
        break;
      }
      case "handicap": {
        for (const pair of chunkPairs(group, "home", "away")) {
          const home = pair.find((item) => item.side === "home");
          const away = pair.find((item) => item.side === "away");
          if (home && away) {
            legacy.handicap.push({
              raw: `${legacyRaw(home)}/${legacyRaw(away)}`,
              line: home.line ?? 0,
              water: legacyWater(home),
              home: String(home.odds),
              away: String(away.odds),
            });
          }
        }
        break;
      }
      case "totalGoals": {
        for (const pair of chunkPairs(group, "over", "under")) {
          const over = pair.find((item) => item.side === "over");
          const under = pair.find((item) => item.side === "under");
          if (over && under) {
            legacy.overUnder.push({
              raw: `${legacyRaw(over)}/${legacyRaw(under)}`,
              line: over.line ?? 0,
              water: legacyWater(over),
              over: String(over.odds),
              under: String(under.odds),
            });
          }
        }
        break;
      }
      case "teamGoals": {
        for (const pair of chunkPairs(group, "over", "under")) {
          const over = pair.find((item) => item.side === "over");
          const under = pair.find((item) => item.side === "under");
          if (over && under) {
            legacy.otherMarkets.push({
              name: sample.title,
              raw: `${legacyRaw(over)}/${legacyRaw(under)}`,
              line: over.line ?? 0,
              water: legacyWater(over),
              selections: [
                { label: "大", odds: String(over.odds) },
                { label: "小", odds: String(under.odds) },
              ],
            });
          }
        }
        break;
      }
      case "corners":
      case "cards": {
        const isHandicap =
          sample.marketFamily === "asianHandicap" ||
          /让|讓/.test(sample.title);
        const pairs = isHandicap
          ? chunkPairs(group, "home", "away")
          : chunkPairs(group, "over", "under");

        for (const pair of pairs) {
          if (isHandicap) {
            const home = pair.find((item) => item.side === "home");
            const away = pair.find((item) => item.side === "away");
            if (home && away) {
              legacy.otherMarkets.push({
                name: sample.title,
                raw: `${legacyRaw(home)}/${legacyRaw(away)}`,
                line: home.line ?? 0,
                water: legacyWater(home),
                selections: [
                  { label: "主", odds: String(home.odds) },
                  { label: "客", odds: String(away.odds) },
                ],
              });
            }
          } else {
            const over = pair.find((item) => item.side === "over");
            const under = pair.find((item) => item.side === "under");
            if (over && under) {
              legacy.otherMarkets.push({
                name: sample.title,
                raw: `${legacyRaw(over)}/${legacyRaw(under)}`,
                line: over.line ?? 0,
                water: legacyWater(over),
                selections: [
                  { label: "大", odds: String(over.odds) },
                  { label: "小", odds: String(under.odds) },
                ],
              });
            }
          }
        }
        break;
      }
      case "btts": {
        const yes = projected.find((item) => item.side === "yes");
        const no = projected.find((item) => item.side === "no");
        if (yes && no) {
          legacy.btts.push({ yes: String(yes.odds), no: String(no.odds) });
        }
        break;
      }
      case "oddEven": {
        const odd = projected.find((item) => item.side === "odd");
        const even = projected.find((item) => item.side === "even");
        if (odd && even) {
          legacy.oddEven.push({ odd: String(odd.odds), even: String(even.odds) });
        }
        break;
      }
      case "correctScore":
      case "halfTimeFullTime":
      case "doubleChance":
      case "firstGoal":
      case "lastGoal":
      case "special": {
        if (group.length > 0) {
          legacy.otherMarkets.push({
            name: sample.title,
            raw: group
              .map((item) => {
                const label = item.label ?? item.rawLine;
                return label ? `${label} ${item.odds}` : String(item.odds);
              })
              .join("  "),
            line: 0,
            water: null,
            selections: group.map((item) => ({
              label: item.label ?? item.rawLine ?? item.side,
              odds: String(item.odds),
            })),
          });
        }
        break;
      }
    }
  }

  return {
    ...data,
    selections,
    ...legacy,
  };
}

export function hasParsedMarkets(data: MatchData): boolean {
  return data.marketSelections.length > 0 || data.unknownMarkets.length > 0;
}

export function warnUnknownMarkets(unknownMarkets: MatchData["unknownMarkets"]): void {
  if (unknownMarkets.length === 0) {
    return;
  }

  console.warn(
    `[parser] ${unknownMarkets.length} unknown market(s) detected:`
  );
  for (const market of unknownMarkets) {
    console.warn(`- ${market.name}: ${market.raw}`);
  }
}

export function mergeMatchData(primary: MatchData, fallback: MatchData): MatchData {
  return syncLegacyMarkets({
    league: primary.league || fallback.league,
    homeTeam: primary.homeTeam || fallback.homeTeam,
    awayTeam: primary.awayTeam || fallback.awayTeam,
    marketSelections:
      primary.marketSelections.length > 0
        ? primary.marketSelections
        : fallback.marketSelections,
    selections: [],
    unknownMarkets: mergeUnknownMarkets(
      primary.unknownMarkets,
      fallback.unknownMarkets
    ),
    ...emptyLegacyMarkets(),
  });
}

function mergeUnknownMarkets(
  primary: MatchData["unknownMarkets"],
  fallback: MatchData["unknownMarkets"]
): MatchData["unknownMarkets"] {
  const merged = primary.map((item) => ({ ...item, examples: [...item.examples] }));

  for (const item of fallback) {
    const existing = merged.find((entry) => entry.name === item.name);
    if (existing) {
      existing.count += item.count;
      existing.raw = item.raw || existing.raw;
      for (const example of item.examples) {
        if (!existing.examples.includes(example)) {
          existing.examples.push(example);
        }
      }
    } else {
      merged.push({ ...item, examples: [...item.examples] });
    }
  }

  return merged;
}

export function finalizeMatchData(
  data: Omit<
    MatchData,
    keyof ReturnType<typeof emptyLegacyMarkets> | "selections"
  >
): MatchData {
  return syncLegacyMarkets({
    ...data,
    selections: [],
    ...emptyLegacyMarkets(),
  });
}
