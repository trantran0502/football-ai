import { convertRawOdds } from "@/lib/analysis/featureScore/oddsConversion";
import type { MarketSelection } from "@/types/match";
import type { MarketSignal } from "./marketEngineTypes";
import type { MarketScoreInput } from "./marketScore";

export type WaterLevel = "low" | "mid" | "high" | "unknown";
export type MarketPattern = "balanced" | "extreme" | "trap_suspected" | "neutral";

export interface SelectionOddsInsight {
  side: string;
  rawOdds: number;
  decimalOdds: number;
  impliedProbability: number;
  waterLevel: WaterLevel;
}

export interface MarketOddsRuleResult {
  selections: SelectionOddsInsight[];
  oddsDiff: number | null;
  impliedProbDiff: number | null;
  overround: number | null;
  waterLevel: WaterLevel;
  pattern: MarketPattern;
  isBalanced: boolean;
  isExtreme: boolean;
  isTrapSuspected: boolean;
  signals: MarketSignal[];
  scoreInput: MarketScoreInput;
}

function resolveImpliedProbability(selection: MarketSelection): number | null {
  if (
    typeof selection.impliedProbability === "number" &&
    Number.isFinite(selection.impliedProbability) &&
    selection.impliedProbability > 0 &&
    selection.impliedProbability <= 1
  ) {
    return selection.impliedProbability;
  }

  return convertRawOdds(selection.odds)?.impliedProbability ?? null;
}

function resolveDecimalOdds(selection: MarketSelection): number | null {
  return convertRawOdds(selection.odds)?.decimalOdds ?? null;
}

export function classifyWaterLevel(rawOdds: number, format: "decimal" | "hong_kong" | "unknown"): WaterLevel {
  if (format === "hong_kong") {
    if (rawOdds < 0.85) {
      return "low";
    }
    if (rawOdds > 0.98) {
      return "high";
    }
    return "mid";
  }

  if (format === "decimal") {
    if (rawOdds <= 1.75) {
      return "low";
    }
    if (rawOdds >= 2.2) {
      return "high";
    }
    return "mid";
  }

  return "unknown";
}

function detectPattern(
  insights: SelectionOddsInsight[],
  oddsDiff: number | null,
  impliedProbDiff: number | null
): MarketPattern {
  if (insights.length < 2 || oddsDiff === null || impliedProbDiff === null) {
    return "neutral";
  }

  const lowWaterCount = insights.filter((item) => item.waterLevel === "low").length;
  const hasExtremeWater = insights.some((item) => item.waterLevel === "low" && item.rawOdds < 0.75);

  if (hasExtremeWater || impliedProbDiff >= 0.18) {
    return "extreme";
  }

  if (lowWaterCount >= 1 && oddsDiff >= 0.12) {
    return "trap_suspected";
  }

  if (oddsDiff <= 0.06) {
    return "balanced";
  }

  return "neutral";
}

export function evaluateMarketOddsRules(selections: MarketSelection[]): MarketOddsRuleResult {
  const signals: MarketSignal[] = [];
  const insights: SelectionOddsInsight[] = [];

  for (const selection of selections) {
    const converted = convertRawOdds(selection.odds);
    const impliedProbability = resolveImpliedProbability(selection);
    const decimalOdds = resolveDecimalOdds(selection);

    if (converted === null || impliedProbability === null || decimalOdds === null) {
      continue;
    }

    const waterLevel = classifyWaterLevel(converted.rawOdds, converted.format);
    insights.push({
      side: selection.side,
      rawOdds: converted.rawOdds,
      decimalOdds,
      impliedProbability,
      waterLevel,
    });

    signals.push({
      id: `${selection.side}_odds`,
      label: `${selection.side} odds`,
      value: converted.rawOdds,
    });
    signals.push({
      id: `${selection.side}_implied_probability`,
      label: `${selection.side} implied probability`,
      value: Number(impliedProbability.toFixed(4)),
    });
    signals.push({
      id: `${selection.side}_water_level`,
      label: `${selection.side} water level`,
      value: waterLevel,
    });
  }

  const oddsValues = insights.map((item) => item.rawOdds);
  const impliedValues = insights.map((item) => item.impliedProbability);
  const oddsDiff =
    oddsValues.length >= 2
      ? Math.max(...oddsValues) - Math.min(...oddsValues)
      : null;
  const impliedProbDiff =
    impliedValues.length >= 2
      ? Math.max(...impliedValues) - Math.min(...impliedValues)
      : null;
  const overround =
    impliedValues.length >= 2
      ? impliedValues.reduce((sum, value) => sum + value, 0) - 1
      : null;

  const pattern = detectPattern(insights, oddsDiff, impliedProbDiff);
  const isBalanced = pattern === "balanced";
  const isExtreme = pattern === "extreme";
  const isTrapSuspected = pattern === "trap_suspected";

  const dominantWater =
    insights.find((item) => item.waterLevel === "low")?.waterLevel ??
    insights[0]?.waterLevel ??
    "unknown";

  signals.push({
    id: "odds_diff",
    label: "Odds difference",
    value: oddsDiff ?? "n/a",
  });
  signals.push({
    id: "implied_prob_diff",
    label: "Implied probability difference",
    value: impliedProbDiff !== null ? Number(impliedProbDiff.toFixed(4)) : "n/a",
  });
  signals.push({
    id: "overround",
    label: "Overround",
    value: overround !== null ? Number(overround.toFixed(4)) : "n/a",
  });
  signals.push({
    id: "market_pattern",
    label: "Market pattern",
    value: pattern,
  });
  signals.push({
    id: "is_balanced",
    label: "Balanced market",
    value: isBalanced,
  });
  signals.push({
    id: "is_extreme",
    label: "Extreme market",
    value: isExtreme,
  });
  signals.push({
    id: "is_trap_suspected",
    label: "Trap suspected",
    value: isTrapSuspected,
  });

  const impliedEdge = impliedProbDiff !== null ? Math.min(0.25, impliedProbDiff) / 0.25 : 0;
  const balanceScore = isBalanced ? 1 : isExtreme ? -0.5 : 0.2;
  const waterQualityScore =
    dominantWater === "mid" ? 1 : dominantWater === "high" ? 0.5 : dominantWater === "low" ? 0.2 : 0;
  const patternPenalty = isTrapSuspected ? 1 : isExtreme ? 0.7 : 0;

  return {
    selections: insights,
    oddsDiff,
    impliedProbDiff,
    overround,
    waterLevel: dominantWater,
    pattern,
    isBalanced,
    isExtreme,
    isTrapSuspected,
    signals,
    scoreInput: {
      impliedEdge,
      balanceScore,
      waterQualityScore,
      patternPenalty,
    },
  };
}
