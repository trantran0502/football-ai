import type { MarketSelection } from "@/types/match";
import {
  getHandicapSettlementAtBoundary,
  getOppositeAsianLine,
  getSignedHandicap,
  getTotalSettlementAtBoundary,
  parseAsianMarketLine,
  type HandicapAnchorSide,
} from "@/lib/parser/asianRules";
import { europeanOddsToProbability } from "@/lib/analysis/oddsCalculator";
import {
  inferMarketPeriod,
  isFormalNonAsianMarket,
  resolveMarketFamily,
} from "@/lib/parser/marketMeta";

const ASIAN_PAIR_SIDES: ReadonlySet<MarketSelection["side"]> = new Set([
  "home",
  "away",
  "over",
  "under",
]);

function isAsianPair(first: MarketSelection, second: MarketSelection): boolean {
  return (
    (first.marketFamily === "asianHandicap" ||
      first.marketFamily === "asianOverUnder") &&
    first.marketFamily === second.marketFamily &&
    first.title === second.title &&
    ASIAN_PAIR_SIDES.has(first.side) &&
    ASIAN_PAIR_SIDES.has(second.side) &&
    first.side !== second.side
  );
}

function normalizeAsianFields(selection: MarketSelection): MarketSelection {
  if (isFormalNonAsianMarket(selection.marketType)) {
    return {
      ...selection,
      rawLine: selection.label ?? selection.rawLine,
      line: null,
      modifier: null,
      handicap: null,
    };
  }
  return selection;
}

function resolveBoundarySettlement(
  selection: MarketSelection
): MarketSelection["boundarySettlement"] {
  if (!selection.modifier) {
    return undefined;
  }
  if (selection.modifier === "half") {
    return "fullResult";
  }

  if (selection.marketFamily === "asianHandicap") {
    if (selection.side === "home" || selection.side === "away") {
      return getHandicapSettlementAtBoundary(
        selection.side,
        selection.modifier
      );
    }
    return undefined;
  }

  if (selection.marketFamily === "asianOverUnder") {
    if (selection.side === "over" || selection.side === "under") {
      return getTotalSettlementAtBoundary(
        selection.side,
        selection.modifier
      );
    }
  }

  return undefined;
}

function enrichSelection(selection: MarketSelection): MarketSelection {
  const family = resolveMarketFamily(selection.marketType, selection.title);
  const period = inferMarketPeriod(selection.title);
  const base = normalizeAsianFields({
    ...selection,
    marketFamily: family,
    period: selection.period ?? period,
  });

  return {
    ...base,
    boundarySettlement: resolveBoundarySettlement(base),
    impliedProbability: europeanOddsToProbability(base.odds) ?? undefined,
  };
}

function applyOppositeToken(
  anchorToken: string,
  pairedToken: string
): { anchor: string; paired: string } {
  const anchorLine = parseAsianMarketLine(anchorToken);
  const pairedLine = parseAsianMarketLine(pairedToken);
  if (!anchorLine || !pairedLine || anchorLine.line !== pairedLine.line) {
    return { anchor: anchorToken, paired: pairedToken };
  }

  const anchorIsSplit =
    anchorLine.modifier === "minus50" || anchorLine.modifier === "plus50";
  const pairedIsSplit =
    pairedLine.modifier === "minus50" || pairedLine.modifier === "plus50";

  if (anchorLine.modifier === "plain" && pairedIsSplit) {
    const opposite = getOppositeAsianLine(pairedToken);
    return opposite
      ? { anchor: opposite, paired: pairedToken }
      : { anchor: anchorToken, paired: pairedToken };
  }

  if (pairedLine.modifier === "plain" && anchorIsSplit) {
    const opposite = getOppositeAsianLine(anchorToken);
    return opposite
      ? { anchor: anchorToken, paired: opposite }
      : { anchor: anchorToken, paired: pairedToken };
  }

  if (anchorIsSplit && pairedIsSplit) {
    const expected = getOppositeAsianLine(anchorToken);
    if (expected && expected !== pairedToken) {
      return { anchor: anchorToken, paired: expected };
    }
  }

  return { anchor: anchorToken, paired: pairedToken };
}

function rebuildAsianSelection(
  base: MarketSelection,
  token: string
): MarketSelection {
  const asianLine = parseAsianMarketLine(token);
  if (!asianLine) {
    return base;
  }

  const next: MarketSelection = {
    ...base,
    rawLine: asianLine.raw,
    line: asianLine.line,
    modifier: asianLine.modifier,
  };

  if (base.marketFamily === "asianHandicap") {
    const anchorSide: HandicapAnchorSide =
      base.side === "away" ? "away" : "home";
    next.handicap = getSignedHandicap(
      base.side as "home" | "away",
      anchorSide,
      asianLine
    );
  }

  return {
    ...next,
    boundarySettlement: resolveBoundarySettlement(next),
    impliedProbability: europeanOddsToProbability(next.odds) ?? undefined,
  };
}

function normalizeAsianPair(
  first: MarketSelection,
  second: MarketSelection
): [MarketSelection, MarketSelection] {
  const firstToken = first.rawLine;
  const secondToken = second.rawLine;
  if (!firstToken || !secondToken) {
    return [first, second];
  }

  const { anchor, paired } = applyOppositeToken(firstToken, secondToken);
  return [rebuildAsianSelection(first, anchor), rebuildAsianSelection(second, paired)];
}

/**
 * 將 Parser 原始輸出整理為 Analysis Engine 可消费的標準資料。
 */
export function normalizeMarketSelections(
  selections: MarketSelection[]
): MarketSelection[] {
  const normalized: MarketSelection[] = [];

  for (let i = 0; i < selections.length; i++) {
    const current = enrichSelection(selections[i]);
    const next = selections[i + 1];

    if (next && isAsianPair(current, enrichSelection(next))) {
      const [first, second] = normalizeAsianPair(current, enrichSelection(next));
      normalized.push(first, second);
      i++;
      continue;
    }

    normalized.push(current);
  }

  return normalized;
}
