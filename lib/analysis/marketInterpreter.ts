import { unknownField } from "@/lib/analysis/analysisField";
import { NO_RULE_IMPLEMENTED } from "@/lib/analysis/constants";
import type {
  AnalysisFeature,
  BttsInterpretation,
  GenericInterpretation,
  HandicapInterpretation,
  MarketId,
  MarketInterpretation,
  MoneylineInterpretation,
  TotalGoalsInterpretation,
} from "@/lib/analysis/types";

function groupFeaturesByMarket(
  features: AnalysisFeature[]
): Map<MarketId, AnalysisFeature[]> {
  const groups = new Map<MarketId, AnalysisFeature[]>();
  for (const feature of features) {
    const bucket = groups.get(feature.marketId) ?? [];
    bucket.push(feature);
    groups.set(feature.marketId, bucket);
  }
  return groups;
}

function interpretMoneyline(
  marketId: MarketId,
  group: AnalysisFeature[]
): MoneylineInterpretation {
  const sample = group[0];

  return {
    kind: "moneyline",
    marketId,
    marketType: sample.marketType,
    title: sample.title,
    period: sample.period,
    expectedWinner: unknownField(NO_RULE_IMPLEMENTED),
    strength: unknownField(NO_RULE_IMPLEMENTED),
    probabilities: unknownField(NO_RULE_IMPLEMENTED),
  };
}

function interpretHandicap(
  marketId: MarketId,
  group: AnalysisFeature[]
): HandicapInterpretation {
  const sample = group[0];

  return {
    kind: "handicap",
    marketId,
    marketType: sample.marketType,
    title: sample.title,
    period: sample.period,
    expectedMargin: unknownField(NO_RULE_IMPLEMENTED),
    favoredSide: unknownField(NO_RULE_IMPLEMENTED),
    line: unknownField(NO_RULE_IMPLEMENTED),
    strength: unknownField(NO_RULE_IMPLEMENTED),
  };
}

function interpretTotalGoals(
  marketId: MarketId,
  group: AnalysisFeature[]
): TotalGoalsInterpretation {
  const sample = group[0];

  return {
    kind: "totalGoals",
    marketId,
    marketType: sample.marketType,
    title: sample.title,
    period: sample.period,
    expectedGoals: unknownField(NO_RULE_IMPLEMENTED),
    lean: unknownField(NO_RULE_IMPLEMENTED),
    line: unknownField(NO_RULE_IMPLEMENTED),
  };
}

function interpretBtts(
  marketId: MarketId,
  group: AnalysisFeature[]
): BttsInterpretation {
  const sample = group[0];

  return {
    kind: "btts",
    marketId,
    marketType: sample.marketType,
    title: sample.title,
    period: sample.period,
    bothTeamsLikely: unknownField(NO_RULE_IMPLEMENTED),
    yesProbability: unknownField(NO_RULE_IMPLEMENTED),
    noProbability: unknownField(NO_RULE_IMPLEMENTED),
  };
}

function interpretGeneric(
  marketId: MarketId,
  group: AnalysisFeature[]
): GenericInterpretation {
  const sample = group[0];

  return {
    kind: "generic",
    marketId,
    marketType: sample.marketType,
    title: sample.title,
    period: sample.period,
    summary: unknownField(NO_RULE_IMPLEMENTED),
  };
}

function interpretMarketGroup(
  marketId: MarketId,
  group: AnalysisFeature[]
): MarketInterpretation {
  const sample = group[0];
  if (!sample) {
    return {
      kind: "generic",
      marketId,
      marketType: "special",
      title: "",
      period: "full",
      summary: unknownField("empty market"),
    };
  }

  switch (sample.marketType) {
    case "moneyline":
      return interpretMoneyline(marketId, group);
    case "handicap":
      return interpretHandicap(marketId, group);
    case "totalGoals":
    case "teamGoals":
    case "corners":
    case "cards":
      if (sample.marketFamily === "asianOverUnder") {
        return interpretTotalGoals(marketId, group);
      }
      return interpretGeneric(marketId, group);
    case "btts":
      return interpretBtts(marketId, group);
    default:
      return interpretGeneric(marketId, group);
  }
}

/**
 * 將特徵解讀為市場語意。
 * 規則未完成前，所有推論欄位一律 unknown。
 */
export function interpretMarkets(
  features: AnalysisFeature[]
): MarketInterpretation[] {
  const groups = groupFeaturesByMarket(features);
  const interpretations: MarketInterpretation[] = [];

  for (const [marketId, group] of groups) {
    interpretations.push(interpretMarketGroup(marketId, group));
  }

  return interpretations;
}
