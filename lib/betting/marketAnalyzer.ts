import {
  aggregateOddsFormat,
  convertRawOdds,
  type SingleOddsFormat,
} from "@/lib/analysis/featureScore/oddsConversion";
import type {
  LineMovementAnalysis,
  MarketOddsSnapshot,
  OddsHistoryPoint,
  OddsHistoryTimeline,
  OddsMovementDirection,
  OverroundAnalysis,
  SelectionIntelligence,
} from "@/lib/betting/intelligenceTypes";
import type { MarketSelection } from "@/types/match";

const MARKET_TYPE_LABELS: Record<string, string> = {
  moneyline: "Moneyline",
  handicap: "Asian Handicap",
  totalGoals: "Over / Under",
  btts: "BTTS",
  correctScore: "Correct Score",
  teamGoals: "Team Goals",
  oddEven: "Odd / Even",
};

const HALF_PERIOD_TYPES = new Set(["half"]);

export function buildMarketKey(selection: MarketSelection): string {
  const linePart =
    selection.line !== null && selection.line !== undefined
      ? `@${selection.line}`
      : "";
  return `${selection.marketType}|${selection.period}|${selection.title}|${selection.side}${linePart}`;
}

export function buildSelectionLabel(selection: MarketSelection): string {
  return selection.label ?? `${selection.title} ${selection.side}${selection.line != null ? ` ${selection.line}` : ""}`;
}

export function resolveMarketTypeLabel(marketType: string): string {
  return MARKET_TYPE_LABELS[marketType] ?? marketType;
}

export function isHalfTimeMarket(selection: MarketSelection): boolean {
  return selection.period === "half" || HALF_PERIOD_TYPES.has(selection.period);
}

export function toOddsSnapshot(rawOdds: number): MarketOddsSnapshot | null {
  const converted = convertRawOdds(rawOdds);
  if (!converted) {
    return null;
  }
  return {
    rawOdds: converted.rawOdds,
    decimalOdds: converted.decimalOdds,
    impliedProbability: converted.impliedProbability,
    format: converted.format,
  };
}

export function detectMovement(
  previous: number | null,
  current: number | null,
  epsilon = 0.001
): OddsMovementDirection {
  if (previous === null || current === null) {
    return "unknown";
  }
  if (Math.abs(current - previous) <= epsilon) {
    return "stable";
  }
  return current > previous ? "up" : "down";
}

export function buildHistoryPoint(
  odds: number,
  source: OddsHistoryPoint["source"],
  timestamp: string,
  previousOdds: number | null = null
): OddsHistoryPoint | null {
  const snapshot = toOddsSnapshot(odds);
  if (!snapshot) {
    return null;
  }
  return {
    timestamp,
    source,
    odds: snapshot.rawOdds,
    decimalOdds: snapshot.decimalOdds,
    impliedProbability: snapshot.impliedProbability,
    movement: detectMovement(previousOdds, snapshot.decimalOdds),
  };
}

export function analyzeLineMovement(
  timeline: OddsHistoryTimeline | null,
  current: MarketOddsSnapshot | null,
  line: number | null
): LineMovementAnalysis {
  const points = timeline?.points ?? [];
  const openingPoint = points.find((point) => point.source === "opening") ?? points[0] ?? null;
  const closingPoint =
    points.find((point) => point.source === "closing") ?? points[points.length - 1] ?? null;

  const openingLine = line;
  const currentLine = line;
  const closingLine = line;

  const openingPrice = openingPoint?.decimalOdds ?? current?.decimalOdds ?? null;
  const currentPrice = current?.decimalOdds ?? closingPoint?.decimalOdds ?? null;
  const closingPrice = closingPoint?.decimalOdds ?? currentPrice;

  let movementCount = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].movement !== "stable") {
      movementCount += 1;
    }
  }

  return {
    direction: detectMovement(openingPrice, currentPrice),
    openingLine,
    currentLine,
    closingLine,
    lineDelta:
      openingLine !== null && currentLine !== null ? currentLine - openingLine : null,
    priceDelta:
      openingPrice !== null && currentPrice !== null
        ? currentPrice - openingPrice
        : null,
    movementCount,
  };
}

export function computeOverroundForMarket(
  marketKey: string,
  selections: Array<{ side: string; impliedProbability: number }>
): OverroundAnalysis | null {
  if (selections.length === 0) {
    return null;
  }

  const impliedSum = selections.reduce(
    (sum, item) => sum + item.impliedProbability,
    0
  );
  if (!Number.isFinite(impliedSum) || impliedSum <= 0) {
    return null;
  }

  const fairProbabilities: Record<string, number> = {};
  for (const item of selections) {
    fairProbabilities[item.side] = item.impliedProbability / impliedSum;
  }

  return {
    marketKey,
    impliedSum,
    overround: impliedSum - 1,
    marginPercent: Math.max(0, (impliedSum - 1) * 100),
    fairProbabilities,
  };
}

export function groupSelectionsByMarket(
  selections: MarketSelection[]
): Map<string, MarketSelection[]> {
  const groups = new Map<string, MarketSelection[]>();
  for (const selection of selections) {
    const groupKey = `${selection.marketType}|${selection.period}|${selection.title}|${selection.line ?? "null"}`;
    const list = groups.get(groupKey) ?? [];
    list.push(selection);
    groups.set(groupKey, list);
  }
  return groups;
}

export function resolveTimelineForSelection(
  marketKey: string,
  timelines: OddsHistoryTimeline[]
): OddsHistoryTimeline | null {
  return timelines.find((timeline) => timeline.marketKey === marketKey) ?? null;
}

export function aggregateMarketFormat(
  snapshots: Array<MarketOddsSnapshot | null>
): SingleOddsFormat | "mixed" | "unknown" {
  const formats = snapshots
    .filter((snapshot): snapshot is MarketOddsSnapshot => snapshot !== null)
    .map((snapshot) => snapshot.format);
  return aggregateOddsFormat(formats);
}

export function analyzeSelectionOdds(
  selection: MarketSelection,
  timeline: OddsHistoryTimeline | null,
  capturedAt: string
): Pick<
  SelectionIntelligence,
  "opening" | "current" | "closing" | "lineMovement" | "historyTimeline"
> {
  const current = toOddsSnapshot(selection.odds);
  const points = timeline?.points ?? [];

  const openingPoint =
    points.find((point) => point.source === "opening") ?? points[0] ?? null;
  const closingPoint =
    points.find((point) => point.source === "closing") ??
    points[points.length - 1] ??
    null;

  const opening = openingPoint ? toOddsSnapshot(openingPoint.odds) : current;
  const closing = closingPoint ? toOddsSnapshot(closingPoint.odds) : current;

  const historyTimeline =
    points.length > 0
      ? points
      : current
        ? [
            buildHistoryPoint(
              current.rawOdds,
              "current",
              capturedAt,
              null
            )!,
          ]
        : [];

  return {
    opening,
    current,
    closing,
    lineMovement: analyzeLineMovement(timeline, current, selection.line),
    historyTimeline,
  };
}
