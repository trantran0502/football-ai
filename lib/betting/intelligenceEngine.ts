import type { FeatureFusionResult } from "@/lib/analysis/featureScore/fusion/fusionTypes";
import { attachClosingLineValues, averageClosingLineValue } from "@/lib/betting/closingLine";
import type {
  BettingIntelligenceResult,
  BettingIntelligenceSignal,
  BettingIntelligenceSummary,
  BookmakerSelectionQuote,
  BuildBettingIntelligenceInput,
  MarketTypeIntelligence,
  SelectionIntelligence,
} from "@/lib/betting/intelligenceTypes";
import {
  analyzeSelectionOdds,
  buildMarketKey,
  buildSelectionLabel,
  computeOverroundForMarket,
  groupSelectionsByMarket,
  resolveMarketTypeLabel,
  resolveTimelineForSelection,
} from "@/lib/betting/marketAnalyzer";
import {
  analyzeBookmakerConsensus,
  compareLineAndPriceDirection,
  detectSteamMove,
  enrichConsensusWithSignals,
  findBookmakerQuotes,
  pickBestBookmaker,
} from "@/lib/betting/marketConsensus";
import { buildValueBetMetrics } from "@/lib/betting/valueBetCalculator";
import type { MarketSelection, MarketType } from "@/types/match";

const ANALYZED_MARKET_TYPES: MarketType[] = [
  "moneyline",
  "handicap",
  "totalGoals",
  "btts",
  "correctScore",
  "teamGoals",
];

function buildIntelligenceSignals(input: {
  selections: SelectionIntelligence[];
  fusion: FeatureFusionResult | null;
  steamDetected: boolean;
  reverseLineDetected: boolean;
}): BettingIntelligenceSignal[] {
  const valueSelections = input.selections.filter(
    (selection) => (selection.valueBet?.expectedValue ?? 0) > 0
  );
  const averageEv =
    valueSelections.length > 0
      ? valueSelections.reduce(
          (sum, selection) => sum + (selection.valueBet?.expectedValue ?? 0),
          0
        ) / valueSelections.length
      : 0;
  const clvAverage = averageClosingLineValue(input.selections) ?? 0;
  const consensusAligned = input.selections.filter(
    (selection) => selection.consensus?.status === "aligned"
  ).length;
  const movementCount = input.selections.reduce(
    (sum, selection) => sum + selection.lineMovement.movementCount,
    0
  );
  const priceDeltaAverage =
    input.selections.reduce(
      (sum, selection) => sum + Math.abs(selection.lineMovement.priceDelta ?? 0),
      0
    ) / Math.max(1, input.selections.length);

  return [
    {
      id: "market_strength",
      score: input.fusion?.overallScore ?? 0,
      confidence: input.fusion?.overallConfidence ?? 0,
      weight: 1,
      explanation: "Derived from fusion overall score without modifying fusion engine.",
    },
    {
      id: "market_stability",
      score: Math.max(-100, 100 - movementCount * 12),
      confidence: 0.6,
      weight: 0.8,
      explanation: "Higher stability when fewer price movements are recorded.",
    },
    {
      id: "steam_signal",
      score: input.steamDetected ? 75 : 0,
      confidence: input.steamDetected ? 0.7 : 0.2,
      weight: 0.9,
      explanation: input.steamDetected
        ? "Steam move detected in odds history."
        : "No steam move detected.",
    },
    {
      id: "value_signal",
      score: Math.min(100, averageEv * 500),
      confidence: valueSelections.length > 0 ? 0.75 : 0.2,
      weight: 1,
      explanation: `Average positive EV ${(averageEv * 100).toFixed(2)}% across ${valueSelections.length} selection(s).`,
    },
    {
      id: "consensus_signal",
      score: Math.min(100, consensusAligned * 20),
      confidence: 0.65,
      weight: 0.85,
      explanation: `${consensusAligned} selection(s) show aligned bookmaker consensus.`,
    },
    {
      id: "line_movement",
      score: Math.min(
        100,
        input.selections.filter((selection) => selection.lineMovement.direction !== "stable")
          .length * 15
      ),
      confidence: 0.6,
      weight: 0.7,
      explanation: "Line movement intensity across analyzed selections.",
    },
    {
      id: "price_movement",
      score: Math.min(100, priceDeltaAverage * 120),
      confidence: 0.6,
      weight: 0.7,
      explanation: "Average absolute price movement magnitude.",
    },
    {
      id: "clv_projection",
      score: Math.min(100, Math.max(-100, clvAverage * 400)),
      confidence: clvAverage !== 0 ? 0.7 : 0.25,
      weight: 0.95,
      explanation: `Projected closing line value ${(clvAverage * 100).toFixed(2)}%.`,
    },
    {
      id: "kelly_signal",
      score: Math.min(
        100,
        valueSelections.reduce(
          (sum, selection) => sum + (selection.valueBet?.kellyFraction ?? 0),
          0
        ) * 100
      ),
      confidence: 0.7,
      weight: 0.9,
      explanation: "Kelly fraction aggregated from positive-value selections.",
    },
  ];
}

function buildSummary(input: {
  selections: SelectionIntelligence[];
  marketTypes: MarketTypeIntelligence[];
  steamMoveCount: number;
  reverseLineMovementCount: number;
  bestBookmaker: string | null;
}): BettingIntelligenceSummary {
  const valueSelections = input.selections.filter(
    (selection) => (selection.valueBet?.expectedValue ?? 0) > 0
  );
  const averageExpectedValue =
    input.selections.length > 0
      ? input.selections.reduce(
          (sum, selection) => sum + (selection.valueBet?.expectedValue ?? 0),
          0
        ) / input.selections.length
      : 0;

  const bestMarket = [...input.marketTypes]
    .filter((market) => market.bestValueSelection !== null)
    .sort((left, right) => {
      const leftSelection = input.selections.find(
        (selection) => selection.marketKey === left.bestValueSelection
      );
      const rightSelection = input.selections.find(
        (selection) => selection.marketKey === right.bestValueSelection
      );
      return (
        (rightSelection?.valueBet?.expectedValue ?? 0) -
        (leftSelection?.valueBet?.expectedValue ?? 0)
      );
    })[0];

  return {
    totalSelections: input.selections.length,
    valueBetCount: valueSelections.length,
    averageExpectedValue,
    averageClosingLineValue: averageClosingLineValue(input.selections),
    bestMarketType: bestMarket?.marketType ?? null,
    bestBookmaker: input.bestBookmaker,
    consensusAlignedCount: input.selections.filter(
      (selection) => selection.consensus?.status === "aligned"
    ).length,
    consensusDivergentCount: input.selections.filter(
      (selection) => selection.consensus?.status === "divergent"
    ).length,
    steamMoveCount: input.steamMoveCount,
    reverseLineMovementCount: input.reverseLineMovementCount,
  };
}

function analyzeSelection(
  selection: MarketSelection,
  input: BuildBettingIntelligenceInput,
  overround: ReturnType<typeof computeOverroundForMarket>,
  capturedAt: string
): SelectionIntelligence {
  const marketKey = buildMarketKey(selection);
  const timeline = resolveTimelineForSelection(
    marketKey,
    input.oddsHistory?.timelines ?? []
  );
  const oddsViews = analyzeSelectionOdds(selection, timeline, capturedAt);
  const bookmakerQuotes = findBookmakerQuotes(marketKey, input.multiBookmaker);
  const consensus = analyzeBookmakerConsensus(bookmakerQuotes);
  const fairProbability =
    overround?.fairProbabilities[selection.side] ??
    oddsViews.current?.impliedProbability ??
    null;

  const valueBet =
    oddsViews.current !== null
      ? buildValueBetMetrics({
          decimalOdds: oddsViews.current.decimalOdds,
          impliedProbability: oddsViews.current.impliedProbability,
          fairProbability,
          fusion: input.fusion ?? null,
        })
      : null;

  return {
    marketKey,
    marketType: selection.marketType,
    period: selection.period,
    side: selection.side,
    title: selection.title,
    label: buildSelectionLabel(selection),
    line: selection.line,
    ...oddsViews,
    overround,
    valueBet,
    bookmakerQuotes,
    consensus,
  };
}

function buildMarketTypeGroups(
  selections: SelectionIntelligence[]
): MarketTypeIntelligence[] {
  const groups = new Map<MarketType, SelectionIntelligence[]>();
  for (const selection of selections) {
    const list = groups.get(selection.marketType) ?? [];
    list.push(selection);
    groups.set(selection.marketType, list);
  }

  return [...groups.entries()].map(([marketType, marketSelections]) => {
    const overroundValues = marketSelections
      .map((selection) => selection.overround?.marginPercent)
      .filter((value): value is number => value !== undefined && value !== null);
    const bestValueSelection = [...marketSelections]
      .sort(
        (left, right) =>
          (right.valueBet?.expectedValue ?? 0) - (left.valueBet?.expectedValue ?? 0)
      )
      .find((selection) => (selection.valueBet?.expectedValue ?? 0) > 0);

    return {
      marketType,
      label: resolveMarketTypeLabel(marketType),
      selectionCount: marketSelections.length,
      averageOverround:
        overroundValues.length > 0
          ? overroundValues.reduce((sum, value) => sum + value, 0) /
            overroundValues.length
          : null,
      bestValueSelection: bestValueSelection?.marketKey ?? null,
      selections: marketSelections,
    };
  });
}

export function buildBettingIntelligence(
  input: BuildBettingIntelligenceInput
): BettingIntelligenceResult {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const relevantSelections = input.marketSelections.filter((selection) =>
    ANALYZED_MARKET_TYPES.includes(selection.marketType)
  );

  const grouped = groupSelectionsByMarket(relevantSelections);
  const overroundByGroup = new Map<string, ReturnType<typeof computeOverroundForMarket>>();
  for (const [groupKey, selections] of grouped.entries()) {
    overroundByGroup.set(
      groupKey,
      computeOverroundForMarket(
        groupKey,
        selections.map((selection) => ({
          side: selection.side,
          impliedProbability:
            selection.impliedProbability ??
            analyzeSelectionOdds(selection, null, capturedAt).current
              ?.impliedProbability ??
            0,
        }))
      )
    );
  }

  let selections = relevantSelections.map((selection) => {
    const groupKey = `${selection.marketType}|${selection.period}|${selection.title}|${selection.line ?? "null"}`;
    return analyzeSelection(
      selection,
      input,
      overroundByGroup.get(groupKey) ?? null,
      capturedAt
    );
  });

  selections = attachClosingLineValues(selections);

  const steamMove = detectSteamMove({
    selections: selections.map((selection) => ({
      marketKey: selection.marketKey,
      lineMovement: selection.lineMovement,
    })),
  });

  const reverseLineMovement = compareLineAndPriceDirection({
    lineDelta:
      selections.reduce(
        (sum, selection) => sum + (selection.lineMovement.lineDelta ?? 0),
        0
      ) / Math.max(1, selections.length),
    priceDelta:
      selections.reduce(
        (sum, selection) => sum + (selection.lineMovement.priceDelta ?? 0),
        0
      ) / Math.max(1, selections.length),
  });

  selections = selections.map((selection) => ({
    ...selection,
    consensus: selection.consensus
      ? enrichConsensusWithSignals(
          selection.consensus,
          steamMove.detected,
          reverseLineMovement.detected
        )
      : null,
  }));

  const quotesByMarket = new Map<string, BookmakerSelectionQuote[]>();
  for (const selection of selections) {
    quotesByMarket.set(selection.marketKey, selection.bookmakerQuotes);
  }

  const marketTypes = buildMarketTypeGroups(selections);
  const signals = buildIntelligenceSignals({
    selections,
    fusion: input.fusion ?? null,
    steamDetected: steamMove.detected,
    reverseLineDetected: reverseLineMovement.detected,
  });

  return {
    generatedAt: capturedAt,
    marketTypes,
    selections,
    signals,
    steamMove,
    reverseLineMovement,
    summary: buildSummary({
      selections,
      marketTypes,
      steamMoveCount: steamMove.detected ? steamMove.affectedSelections.length : 0,
      reverseLineMovementCount: reverseLineMovement.detected ? 1 : 0,
      bestBookmaker: pickBestBookmaker(quotesByMarket),
    }),
    fusionReference: input.fusion
      ? {
          overallScore: input.fusion.overallScore,
          overallConfidence: input.fusion.overallConfidence,
        }
      : null,
  };
}
