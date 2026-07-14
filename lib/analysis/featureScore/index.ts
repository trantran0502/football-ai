export type {
  FeatureCollector,
  FeatureScore,
  FeatureScoreCategory,
  FeatureScoreContext,
  FeatureScoreResult,
} from "@/lib/analysis/featureScore/types";

export {
  FEATURE_WEIGHTS,
  getFeatureWeight,
  type FeatureWeightKey,
} from "@/lib/analysis/featureScore/featureWeights";

export {
  buildFeatureScores,
  getRegisteredFeatureCollectors,
  registerFeatureCollector,
  resetFeatureCollectorsForTests,
} from "@/lib/analysis/featureScore/featureScoreEngine";

export {
  aggregateOddsFormat,
  clampConfidence,
  clampImpliedProbability,
  clampScore,
  convertRawOdds,
  convertRawOddsToImpliedProbability,
  inferSingleOddsFormat,
  impliedProbabilityFromDecimalOdds,
  type ConvertedOdds,
  type MarketOddsFormat,
  type SingleOddsFormat,
} from "@/lib/analysis/featureScore/oddsConversion";

export {
  collectMarketOddsFeature,
  isMarketOddsCollectorRegistered,
  registerMarketOddsCollector,
  resetMarketOddsCollectorRegistrationForTests,
  type MarketOddsFeatureMetadata,
} from "@/lib/analysis/featureScore/collectors/marketOddsCollector";
