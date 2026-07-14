import { getFeatureWeight } from "@/lib/analysis/featureScore/featureWeights";
import { registerFeatureCollector } from "@/lib/analysis/featureScore/featureScoreEngine";
import {
  aggregateOddsFormat,
  clampConfidence,
  clampScore,
  convertRawOdds,
  type MarketOddsFormat,
} from "@/lib/analysis/featureScore/oddsConversion";
import type {
  FeatureScore,
  FeatureScoreContext,
} from "@/lib/analysis/featureScore/types";
import type { MarketSelection } from "@/types/match";

const FEATURE_ID = "market_odds";
const MONEYLINE_SIDES = ["home", "draw", "away"] as const;
type MoneylineSide = (typeof MONEYLINE_SIDES)[number];

export interface MarketOddsFeatureMetadata {
  favorite: "home" | "draw" | "away" | "unknown";
  favoriteProbability: number | null;
  secondProbability: number | null;
  marketGap: number | null;
  oddsFormat: MarketOddsFormat;
}

let registered = false;

export function registerMarketOddsCollector(): void {
  if (registered) {
    return;
  }
  registerFeatureCollector(collectMarketOddsFeature);
  registered = true;
}

/** Reset registration flag — for unit tests only. */
export function resetMarketOddsCollectorRegistrationForTests(): void {
  registered = false;
}

export function isMarketOddsCollectorRegistered(): boolean {
  return registered;
}

function getMoneylineSelections(
  marketSelections: MarketSelection[]
): MarketSelection[] {
  const fullTime = marketSelections.filter(
    (selection) =>
      selection.marketType === "moneyline" && selection.period === "full"
  );
  if (fullTime.length > 0) {
    return fullTime;
  }
  return marketSelections.filter(
    (selection) => selection.marketType === "moneyline"
  );
}

function pickMoneylineBySide(
  selections: MarketSelection[]
): Partial<Record<MoneylineSide, MarketSelection>> {
  const picked: Partial<Record<MoneylineSide, MarketSelection>> = {};
  for (const side of MONEYLINE_SIDES) {
    const match = selections.find((selection) => selection.side === side);
    if (match) {
      picked[side] = match;
    }
  }
  return picked;
}

interface MoneylineProbabilityEntry {
  side: "home" | "draw" | "away";
  probability: number;
  format: "decimal" | "hong_kong";
}

function resolveMoneylineProbabilities(
  bySide: Partial<Record<MoneylineSide, MarketSelection>>
): {
  entries: MoneylineProbabilityEntry[];
  oddsFormat: MarketOddsFormat;
  hasAnomaly: boolean;
} {
  const entries: MoneylineProbabilityEntry[] = [];
  const formats: Array<"decimal" | "hong_kong" | "unknown"> = [];
  let hasAnomaly = false;

  for (const side of MONEYLINE_SIDES) {
    const selection = bySide[side];
    if (!selection) {
      continue;
    }

    const converted = convertRawOdds(selection.odds);
    if (!converted || converted.impliedProbability > 1) {
      hasAnomaly = true;
      continue;
    }

    entries.push({
      side,
      probability: converted.impliedProbability,
      format: converted.format === "hong_kong" ? "hong_kong" : "decimal",
    });
    formats.push(converted.format);
  }

  return {
    entries,
    oddsFormat: aggregateOddsFormat(formats),
    hasAnomaly,
  };
}

function scoreFromMarketGap(gap: number): { score: number; reason: string } {
  if (gap < 0.05) {
    return {
      score: 0,
      reason: "Moneyline 第一熱門與第二熱門隱含機率差距小於 5%，市場接近五五波。",
    };
  }
  if (gap < 0.1) {
    return {
      score: 10,
      reason: "Moneyline 熱門與次熱門隱含機率差距 5%～10%，市場略偏一方。",
    };
  }
  if (gap < 0.2) {
    return {
      score: 20,
      reason: "Moneyline 熱門與次熱門隱含機率差距 10%～20%，市場偏向明顯。",
    };
  }
  return {
    score: 30,
    reason: "Moneyline 熱門與次熱門隱含機率差距大於 20%，市場明顯偏向一方。",
  };
}

function resolveConfidence(input: {
  complete: boolean;
  oddsFormat: MarketOddsFormat;
  hasAnomaly: boolean;
  marketGap: number | null;
}): number {
  if (!input.complete) {
    return clampConfidence(0.3);
  }

  if (input.hasAnomaly || input.oddsFormat === "unknown") {
    return clampConfidence(0.25);
  }

  let confidence = 0.75;
  if (input.oddsFormat === "mixed") {
    confidence = 0.45;
  }
  if (input.marketGap !== null && input.marketGap >= 0.2) {
    confidence = Math.max(confidence, 0.85);
  }
  if (input.marketGap !== null && input.marketGap < 0.05) {
    confidence = Math.min(confidence, 0.6);
  }

  return clampConfidence(confidence);
}

function buildIncompleteFeature(
  oddsFormat: MarketOddsFormat,
  hasAnomaly: boolean
): FeatureScore {
  return {
    id: FEATURE_ID,
    category: "moneyline",
    score: 0,
    weight: getFeatureWeight("marketOdds"),
    confidence: resolveConfidence({
      complete: false,
      oddsFormat,
      hasAnomaly,
      marketGap: null,
    }),
    reason: "Moneyline 缺少完整主／和／客三項盤口，無法評估市場強弱。",
    metadata: {
      favorite: "unknown",
      favoriteProbability: null,
      secondProbability: null,
      marketGap: null,
      oddsFormat,
    } as Record<string, unknown>,
  };
}

export function collectMarketOddsFeature(
  context: FeatureScoreContext
): FeatureScore[] {
  const marketSelections = context.marketSelections ?? [];
  if (marketSelections.length === 0) {
    return [buildIncompleteFeature("unknown", false)];
  }

  const moneylineSelections = getMoneylineSelections(marketSelections);
  const bySide = pickMoneylineBySide(moneylineSelections);
  const hasFullMoneyline = MONEYLINE_SIDES.every((side) => bySide[side]);

  const { entries, oddsFormat, hasAnomaly } =
    resolveMoneylineProbabilities(bySide);

  if (!hasFullMoneyline || entries.length < 3) {
    return [buildIncompleteFeature(oddsFormat, hasAnomaly)];
  }

  const sorted = [...entries].sort((a, b) => b.probability - a.probability);
  const favorite = sorted[0];
  const second = sorted[1];
  const marketGap = favorite.probability - second.probability;

  const { score, reason } = scoreFromMarketGap(marketGap);
  const metadata: MarketOddsFeatureMetadata = {
    favorite: favorite.side,
    favoriteProbability: favorite.probability,
    secondProbability: second.probability,
    marketGap,
    oddsFormat,
  };

  return [
    {
      id: FEATURE_ID,
      category: "moneyline",
      score: clampScore(score),
      weight: getFeatureWeight("marketOdds"),
      confidence: resolveConfidence({
        complete: true,
        oddsFormat,
        hasAnomaly,
        marketGap,
      }),
      reason,
      metadata: { ...metadata },
    },
  ];
}
