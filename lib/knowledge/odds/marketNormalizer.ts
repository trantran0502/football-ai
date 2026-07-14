import { calculateImpliedProbability } from "@/lib/knowledge/odds/impliedProbability";
import { convertOdds } from "@/lib/knowledge/odds/oddsConverter";
import type {
  MarketInput,
  NormalizedMarket,
  NormalizedSelection,
  PlatformOddsInput,
} from "@/lib/knowledge/odds/types";

function isPureNumericString(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

function parseLineValue(line: number | string): {
  numeric: number | null;
  raw: string | null;
} {
  if (typeof line === "number") {
    return {
      numeric: Number.isFinite(line) ? line : null,
      raw: String(line),
    };
  }

  const raw = line.trim();
  if (!isPureNumericString(raw)) {
    return { numeric: null, raw };
  }

  const numeric = Number.parseFloat(raw);
  return {
    numeric: Number.isFinite(numeric) ? numeric : null,
    raw,
  };
}

function normalizeSelection(
  side: string,
  odds: PlatformOddsInput,
  line: number | string | null = null
): NormalizedSelection | null {
  const converted = convertOdds(odds);
  if (!converted) {
    return null;
  }

  const impliedProbability = calculateImpliedProbability(converted.decimal);
  if (impliedProbability === null) {
    return null;
  }

  const parsedLine =
    line === null ? { numeric: null, raw: null } : parseLineValue(line);

  return {
    side,
    decimalOdds: converted.decimal,
    impliedProbability,
    line: parsedLine.numeric,
    rawLine: parsedLine.raw,
  };
}

function collectSelections(
  entries: Array<{
    side: string;
    odds: PlatformOddsInput;
    line?: number | string | null;
  }>
): NormalizedSelection[] {
  const selections: NormalizedSelection[] = [];

  for (const entry of entries) {
    const normalized = normalizeSelection(
      entry.side,
      entry.odds,
      entry.line ?? null
    );
    if (normalized) {
      selections.push(normalized);
    }
  }

  return selections;
}

/**
 * 將 Moneyline / Handicap / OverUnder / BTTS 轉為統一格式。
 * 僅做結構正規化與賠率換算，不含規則判斷。
 */
export function normalizeMarket(input: MarketInput): NormalizedMarket {
  switch (input.kind) {
    case "moneyline":
      return {
        kind: "moneyline",
        selections: collectSelections([
          { side: "home", odds: input.home },
          { side: "draw", odds: input.draw },
          { side: "away", odds: input.away },
        ]),
      };
    case "handicap":
      return {
        kind: "handicap",
        selections: collectSelections([
          { side: "home", odds: input.home, line: input.line },
          { side: "away", odds: input.away, line: input.line },
        ]),
      };
    case "overUnder":
      return {
        kind: "overUnder",
        selections: collectSelections([
          { side: "over", odds: input.over, line: input.line },
          { side: "under", odds: input.under, line: input.line },
        ]),
      };
    case "btts":
      return {
        kind: "btts",
        selections: collectSelections([
          { side: "yes", odds: input.yes },
          { side: "no", odds: input.no },
        ]),
      };
  }
}
